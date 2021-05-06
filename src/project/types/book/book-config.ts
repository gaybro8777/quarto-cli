/*
* book-config.ts
*
* Copyright (C) 2020 by RStudio, PBC
*
*/

import { existsSync } from "fs/mod.ts";
import { basename, extname, join } from "path/mod.ts";

import { safeExistsSync } from "../../../core/path.ts";
import { warnOnce } from "../../../core/log.ts";
import { Metadata } from "../../../config/metadata.ts";

import { fileExecutionEngine } from "../../../execute/engine.ts";
import { defaultWriterFormat } from "../../../format/formats.ts";

import {
  normalizeSidebarItem,
  partitionedMarkdownForInput,
  SidebarItem,
  SidebarTool,
} from "../../project-config.ts";
import { kProjectRender, ProjectConfig } from "../../project-context.ts";

import {
  isGithubRepoUrl,
  kContents,
  kSite,
  kSiteFooter,
  kSiteNavbar,
  kSitePageNavigation,
  kSiteRepoActions,
  kSiteRepoUrl,
  kSiteSidebar,
  kSiteTitle,
  kSiteUrl,
  websiteBaseurl,
  websiteConfigActions,
  websiteProjectConfig,
} from "../website/website-config.ts";

import { isNumberedChapter } from "./book-chapters.ts";
import { kOutputExt, kTitle } from "../../../config/constants.ts";

import { isMultiFileBookFormat } from "./book-extension.ts";
import { binaryPath } from "../../../core/resources.ts";
import { execProcess } from "../../../core/process.ts";

const kAppendicesSectionLabel = "Appendices";

export const kBook = "book";
export const kBookContents = "contents";
export const kBookAppendix = "appendix";
export const kBookReferences = "references";
export const kBookRender = "render";
export const kBookOutputFile = "output-file";
export const kBookRepoActions = "repo-actions";
export const kBookSharing = "sharing";
export const kBookDownloads = "downloads";
export const kBookTools = "tools";
export const kBookSearch = "search";
export const kBookAttribution = "attribution";

export type BookConfigKey =
  | "output-file"
  | "contents"
  | "references"
  | "appendix"
  | "render"
  | "repo-actions"
  | "sharing"
  | "downloads"
  | "tools"
  | "title"
  | "subtitle"
  | "author"
  | "date"
  | "abstract";

export async function bookProjectConfig(
  projectDir: string,
  config: ProjectConfig,
) {
  // inherit website config behavior
  config = await websiteProjectConfig(projectDir, config);

  // ensure we have a site
  const site = (config[kSite] || {}) as Record<string, unknown>;
  config[kSite] = site;

  // copy some book config into site
  const book = config[kBook] as Record<string, unknown>;
  if (book) {
    site[kSiteTitle] = book[kSiteTitle];
    site[kSiteUrl] = book[kSiteUrl];
    site[kSiteRepoUrl] = book[kSiteRepoUrl];
    site[kSiteRepoActions] = book[kSiteRepoActions];
    site[kSiteNavbar] = book[kSiteNavbar];
    site[kSiteSidebar] = book[kSiteSidebar];
    site[kSitePageNavigation] = book[kSitePageNavigation] !== false;

    // Conver the attribution markdown into html and place it into the footer
    const attributionMarkdown = book[kBookAttribution];
    if (attributionMarkdown && typeof (attributionMarkdown) === "string") {
      // render the markdown
      const markdown = await renderMarkdown(
        attributionMarkdown,
        kBookAttribution,
      );
      site[kSiteFooter] = markdown;
    }
  }

  // if we have a top-level 'contents' or 'appendix' fields fold into sidebar
  site[kSiteSidebar] = site[kSiteSidebar] || {};
  const siteSidebar = site[kSiteSidebar] as Metadata;
  siteSidebar[kContents] = [];
  const bookContents = bookConfig(kBookContents, config);

  if (Array.isArray(bookContents)) {
    siteSidebar[kContents] = bookContents;
  }
  const bookReferences = bookConfig(kBookReferences, config);
  if (bookReferences) {
    (siteSidebar[kContents] as unknown[]).push(bookReferences);
  }
  const bookAppendix = bookConfig(kBookAppendix, config);
  if (Array.isArray(bookAppendix)) {
    siteSidebar[kContents] = (siteSidebar[kContents] as unknown[])
      .concat([{
        section: kAppendicesSectionLabel,
        contents: bookAppendix,
      }]);
  }

  // if search for book isn't false then enable search
  if (book[kBookSearch] !== false) {
    siteSidebar[kBookSearch] = true;
  }

  // if we have tools then fold those into the sidebar
  siteSidebar[kBookTools] = siteSidebar[kBookTools] || [];
  if (book[kBookTools]) {
    (siteSidebar[kBookTools] as []).push(...book[kBookTools] as []);
  }

  // Prorcess the repo-url (github or journal-code)
  if (site[kSiteRepoUrl]) {
    const repoUrl = site[kSiteRepoUrl] as string;
    const icon = isGithubRepoUrl(repoUrl) ? "github" : "journal-code";
    (siteSidebar[kBookTools] as SidebarTool[]).push({
      text: "Source Code",
      icon,
      href: repoUrl,
    });
  }

  // Create any download tools
  (siteSidebar[kBookTools] as SidebarTool[]).push(
    ...(downloadTools(projectDir, config) || []),
  );

  // Create any sharing options
  (siteSidebar[kBookTools] as SidebarTool[]).push(
    ...(sharingTools(config) || []),
  );

  // save our own render list (which has more fine grained info about parts,
  // appendices, numbering, etc.) and popuplate the main config render list
  const renderItems = await bookRenderItems(projectDir, config);
  book[kBookRender] = renderItems;
  config.project[kProjectRender] = renderItems
    .filter((target) => !!target.file)
    .map((target) => target.file!);

  // return config
  return config;
}

export function bookConfig(
  name: BookConfigKey,
  project?: ProjectConfig,
) {
  const book = project?.[kBook] as
    | Record<string, unknown>
    | undefined;
  if (book) {
    return book[name] as
      | Array<unknown>
      | Record<string, unknown>
      | string
      | undefined;
  } else {
    return undefined;
  }
}

export function bookConfigRenderItems(
  project?: ProjectConfig,
): BookRenderItem[] {
  return bookConfig(
    kBookRender,
    project,
  ) as BookRenderItem[];
}

export function isBookIndexPage(target: BookRenderItem): boolean;
export function isBookIndexPage(target: string): boolean;
export function isBookIndexPage(target: string | BookRenderItem): boolean {
  if (typeof (target) !== "string") {
    return target.type == "index";
  } else {
    return target.startsWith("index.");
  }
}

export type BookRenderItemType = "index" | "chapter" | "appendix" | "part";

export interface BookRenderItem {
  type: BookRenderItemType;
  text?: string;
  file?: string;
  number?: number;
}

export async function bookRenderItems(
  projectDir: string,
  config?: ProjectConfig,
): Promise<BookRenderItem[]> {
  if (!config) {
    return [];
  }

  let nextNumber = 1;
  const inputs: BookRenderItem[] = [];

  const findInputs = async (
    type: BookRenderItemType,
    items: SidebarItem[],
  ) => {
    for (const item of items) {
      if (item.contents) {
        inputs.push({
          type: "part",
          file: item.href,
          text: item.text,
        });
        await findInputs(type, item.contents);
      } else if (item.href) {
        const itemPath = join(projectDir, item.href);
        if (safeExistsSync(itemPath)) {
          const engine = fileExecutionEngine(itemPath, true);
          if (engine) {
            // set index type if appropriate
            const itemType = isBookIndexPage(item.href) ? "index" : type;

            // for chapters, check if we are numbered
            let number: number | undefined;

            if (
              itemType === "chapter" &&
              await inputIsNumbered(projectDir, item.href)
            ) {
              number = nextNumber++;
            }

            // add the input
            inputs.push({
              type: itemType,
              file: item.href,
              number,
            });
          }
        }
      }
    }
  };

  const findChapters = async (
    key: "contents" | "appendix",
    delimiter?: BookRenderItem,
  ) => {
    nextNumber = 1;
    const bookInputs = bookConfig(key, config) as
      | Array<unknown>
      | undefined;
    if (bookInputs) {
      if (delimiter) {
        inputs.push(delimiter);
      }
      await findInputs(
        "chapter",
        bookInputs.map((item) =>
          normalizeSidebarItem(projectDir, item as SidebarItem)
        ),
      );
    }
  };

  await findChapters("contents");

  const references = bookConfig("references", config);
  if (references) {
    await findInputs("chapter", [
      normalizeSidebarItem(projectDir, references as SidebarItem),
    ]);
  }

  await findChapters(kBookAppendix, {
    type: "appendix",
    text: kAppendicesSectionLabel,
  });

  // validate that all of the chapters exist
  const missing = inputs.filter((input) =>
    input.file && !existsSync(join(projectDir, input.file))
  );
  if (missing.length) {
    throw new Error(
      "Book contents file(s) do not exist: " + missing.join(", "),
    );
  }

  // find the index and place it at the front (error if no index)
  const indexPos = inputs.findIndex(isBookIndexPage);
  if (indexPos === -1) {
    throw new Error(
      "Book contents must include a home page (e.g. index.md)",
    );
  }
  const index = inputs.splice(indexPos, 1);
  return index.concat(inputs);
}

function downloadTools(
  projectDir: string,
  config: ProjectConfig,
): SidebarTool[] | undefined {
  // Filter the user actions to the set that are single file books
  const downloadActions = websiteConfigActions("downloads", kBook, config);
  const filteredActions = downloadActions.filter((action) => {
    const format = defaultWriterFormat(action);
    if (format) {
      return format.extensions?.book && !isMultiFileBookFormat(format);
    } else {
      return false;
    }
  });

  // Map the action into sidebar items
  const outputStem = bookOutputStem(projectDir, config);
  const downloads = filteredActions.map((action) => {
    const format = defaultWriterFormat(action);
    return {
      text: `${action}`,
      href: `${outputStem}.${format.render[kOutputExt]}`,
    };
  });

  // Form the menu (or single item download button)
  if (downloads.length === 0) {
    return undefined;
  } else if (downloadTools.length === 1) {
    return [{
      ...downloads[0],
      icon: "download",
    }];
  } else {
    return [{
      icon: "download",
      text: "Download",
      menu: downloads,
    }];
  }
}

export function bookOutputStem(projectDir: string, config?: ProjectConfig) {
  const outputFile = (bookConfig(kBookOutputFile, config) ||
    bookConfig(kTitle, config) || basename(projectDir)) as string;
  const stem = basename(outputFile, extname(outputFile));
  return stem;
}

function sharingTools(
  projectConfig: ProjectConfig,
): SidebarTool[] | undefined {
  // alias the site url
  const siteUrl = websiteBaseurl(projectConfig);

  const sharingActions = websiteConfigActions("sharing", kBook, projectConfig);
  // Filter the items to only the kinds that we know about
  const sidebarTools: SidebarTool[] = [];
  sidebarTools.push(
    ...sharingActions.filter((action) => {
      const sidebarTool = kSharingUrls[action];
      if (sidebarTool) {
        if (sidebarTool.requiresSiteUrl && !siteUrl) {
          warnOnce(
            `Sharing using ${action} requires that you provide a site-url.`,
          );
          return false;
        }
        return true;
      } else {
        return false;
      }
    }).map((action) => {
      return kSharingUrls[action];
    }),
  );

  if (sidebarTools.length === 0) {
    return undefined;
  } else if (sidebarTools.length === 1) {
    // If there is one item, just return it
    return sidebarTools;
  } else {
    // If there are more than one items, make a menu
    return [{
      text: "Share",
      icon: kShareIcon,
      menu: sidebarTools,
    }];
  }
}

interface SharingSidebarTool extends SidebarTool {
  requiresSiteUrl?: boolean;
}

const kShareIcon = "share";
const kSharingUrls: Record<string, SharingSidebarTool> = {
  linkedin: {
    icon: "linkedin",
    text: "LinkedIn",
    href: "https://www.linkedin.com/sharing/share-offsite/?url=",
    requiresSiteUrl: true,
  },
  facebook: {
    icon: "facebook",
    text: "Facebook",
    url: "https://www.facebook.com/sharer/sharer.php",
  },
  twitter: {
    icon: "twitter",
    text: "Twitter",
    url: "http://www.twitter.com/share",
  },
};

async function renderMarkdown(markdown: string, keyname: string) {
  const result = await execProcess({
    cmd: [
      binaryPath("pandoc"),
      "--from",
      "markdown",
      "--to",
      "html",
    ],
    stdout: "piped",
  }, markdown);

  if (result.success) {
    return result.stdout;
  } else {
    throw new Error(
      `Invalid ${keyname} - please verify that the markdown is valid.`,
    );
  }
}

async function inputIsNumbered(
  projectDir: string,
  input: string,
) {
  const partitioned = await partitionedMarkdownForInput(projectDir, input);
  if (partitioned) {
    return isNumberedChapter(partitioned);
  } else {
    return false;
  }
}
