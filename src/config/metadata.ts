/*
* config.ts
*
* Copyright (C) 2020 by RStudio, PBC
*
*/

import { exists } from "fs/exists.ts";
import { join } from "path/mod.ts";

import { readYaml, readYamlFromMarkdownFile } from "../core/yaml.ts";
import { mergeConfigs } from "../core/config.ts";
import { message } from "../core/console.ts";

import {
  kExecutionDefaults,
  kExecutionDefaultsKeys,
  kKeepMd,
  kKeepTex,
  kMetadataFile,
  kMetadataFiles,
  kMetadataFormat,
  kPandocDefaults,
  kPandocDefaultsKeys,
  kPandocMetadata,
  kRenderDefaults,
  kRenderDefaultsKeys,
} from "./constants.ts";
import { Format } from "./format.ts";
import { defaultWriterFormat } from "../format/formats.ts";

export type Metadata = {
  [key: string]: unknown;
};

export function includedMetadata(
  dir: string,
  baseMetadata: Metadata,
): { metadata: Metadata; files: string[] } {
  // Read any metadata files that are defined in the metadata itself
  const yamlFiles: string[] = [];
  const metadataFile = baseMetadata[kMetadataFile];
  if (metadataFile) {
    yamlFiles.push(join(dir, metadataFile as string));
  }

  const metadataFiles = baseMetadata[kMetadataFiles];
  if (metadataFiles && Array.isArray(metadataFiles)) {
    metadataFiles.forEach((file) => yamlFiles.push(join(dir, file)));
  }

  // Read the yaml
  const filesMetadata = yamlFiles.map((yamlFile) => {
    if (exists(yamlFile)) {
      try {
        return readYaml(yamlFile);
      } catch (e) {
        message("\nError reading metadata file from " + yamlFile + "\n");
        throw e;
      }
    } else {
      return undefined;
    }
  });

  // merge the result
  return {
    metadata: mergeConfigs({}, ...filesMetadata),
    files: yamlFiles,
  };
}

export function formatFromMetadata(
  baseFormat: Format,
  to: string,
  debug?: boolean,
): Format {
  // user format options (allow any b/c this is just untyped yaml)
  const typedFormat: Format = {
    render: {},
    execution: {},
    pandoc: {},
    metadata: {},
  };
  // deno-lint-ignore no-explicit-any
  let format = typedFormat as any;

  // see if there is user config for this writer that we need to merge in
  const configFormats = baseFormat.metadata[kMetadataFormat];
  if (configFormats instanceof Object) {
    // deno-lint-ignore no-explicit-any
    const configFormat = (configFormats as any)[to];
    if (configFormat === "default") {
      format = metadataAsFormat({});
    } else if (configFormat instanceof Object) {
      format = metadataAsFormat(configFormat);
    }
  }

  // merge user config into default config
  const mergedFormat = mergeConfigs(
    baseFormat,
    format,
  );

  // force keep_md and keep_tex if we are in debug mode
  if (debug) {
    mergedFormat.render[kKeepMd] = true;
    mergedFormat.render[kKeepTex] = true;
  }

  return mergedFormat;
}

export function metadataAsFormat(metadata: Metadata): Format {
  const typedFormat: Format = {
    render: {},
    execution: {},
    pandoc: {},
    metadata: {},
  };
  // deno-lint-ignore no-explicit-any
  const format = typedFormat as { [key: string]: any };
  Object.keys(metadata).forEach((key) => {
    // allow stuff already sorted into a top level key through unmodified
    if (
      [
        kRenderDefaults,
        kExecutionDefaults,
        kPandocDefaults,
        kPandocMetadata,
      ]
        .includes(key)
    ) {
      format[key] = metadata[key];
    } else {
      // move the key into the appropriate top level key
      if (kRenderDefaultsKeys.includes(key)) {
        format.render[key] = metadata[key];
      } else if (kExecutionDefaultsKeys.includes(key)) {
        format.execution[key] = metadata[key];
      } else if (kPandocDefaultsKeys.includes(key)) {
        format.pandoc[key] = metadata[key];
      } else {
        format.metadata[key] = metadata[key];
      }
    }
  });
  return typedFormat;
}

export function setFormatMetadata(
  format: Format,
  metadata: string,
  key: string,
  value: unknown,
) {
  if (typeof format.metadata[metadata] !== "object") {
    format.metadata[metadata] = {} as Record<string, unknown>;
  }
  // deno-lint-ignore no-explicit-any
  (format.metadata[metadata] as any)[key] = value;
}
