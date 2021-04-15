/*
* website.ts
*
* Copyright (C) 2020 by RStudio, PBC
*
*/

import { join } from "path/mod.ts";
import { ProjectContext, projectOffset } from "../../project-context.ts";
import { resourcePath } from "../../../core/resources.ts";
import { dirAndStem } from "../../../core/path.ts";

import {
  ProjectCreate,
  ProjectOutputFile,
  ProjectType,
} from "../project-types.ts";
import { Format, FormatExtras } from "../../../config/format.ts";
import { PandocFlags } from "../../../config/flags.ts";

import { kPageTitle, kTitle, kTitlePrefix } from "../../../config/constants.ts";
import { formatHasBootstrap } from "../../../format/html/format-html-bootstrap.ts";

import {
  initWebsiteNavigation,
  kNavbar,
  kSidebar,
  websiteNavigationExtras,
} from "./website-navigation.ts";

import { kBaseUrl, updateSitemap } from "./website-sitemap.ts";
import { updateSearchIndex } from "./website-search.ts";

export const websiteProjectType: ProjectType = {
  type: "website",
  create: (): ProjectCreate => {
    const resourceDir = resourcePath(join("projects", "website"));

    return {
      configTemplate: join(resourceDir, "templates", "_quarto.ejs.yml"),
      resourceDir,
      scaffold: [
        {
          name: "index",
          content: "Home page",
          format: "html",
        },
        {
          name: "about",
          content: "## About this site",
          title: "About",
          format: "html",
        },
      ],

      supporting: [
        "styles.css",
      ],
    };
  },

  libDir: "site_libs",
  outputDir: "_site",

  formatLibDirs:
    () => ["bootstrap", "quarto-nav", "quarto-search", "quarto-html"],

  metadataFields: () => [kNavbar, kSidebar, kBaseUrl],

  resourceIgnoreFields: () => [kNavbar, kSidebar, kBaseUrl],

  preRender: async (context: ProjectContext) => {
    await initWebsiteNavigation(context);
  },

  formatExtras: (
    project: ProjectContext,
    input: string,
    flags: PandocFlags,
    format: Format,
  ): Promise<FormatExtras> => {
    // navigation extras for bootstrap enabled formats
    const extras = formatHasBootstrap(format)
      ? websiteNavigationExtras(project, input, flags, format)
      : {};

    // add some title related variables
    extras.pandoc = extras.pandoc || {};
    extras.metadata = extras.metadata || {};

    // is this the home page? (gets some special handling)
    const offset = projectOffset(project, input);
    const [_dir, stem] = dirAndStem(input);
    const home = (stem === "index" && offset === ".");

    // title prefix if the project has a title and this isn't the home page
    const title = project.metadata?.project?.title;
    if (title && !home) {
      extras.metadata = {
        [kTitlePrefix]: project.metadata?.project?.title,
      };
    }

    // pagetitle for home page if it has no title
    if (
      home && !format.metadata[kTitle] && !format.metadata[kPageTitle] && title
    ) {
      extras.metadata[kPageTitle] = title;
    }

    return Promise.resolve(extras);
  },

  postRender: async (
    context: ProjectContext,
    incremental: boolean,
    outputFiles: ProjectOutputFile[],
  ) => {
    // update sitemap
    await updateSitemap(context, outputFiles, incremental);

    // update search index
    updateSearchIndex(context, outputFiles, incremental);
  },
};
