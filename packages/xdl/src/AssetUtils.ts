import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import chalk from 'chalk';
import glob from 'glob';
import { sharpAsync } from '@expo/image-utils';
import JsonFile from '@expo/json-file';
import { readConfigJsonAsync } from '@expo/config';
import temporary from 'tempy';

import logger from './Logger';

/*
 * Calculate SHA256 Checksum value of a file based on its contents
 */
export function calculateHash(filePath: string): string {
  const contents = fs.readFileSync(filePath);
  return crypto
    .createHash('sha256')
    .update(contents)
    .digest('hex');
}

/*
 * Compress an inputted jpg or png
 */
export async function optimizeImageAsync(inputPath: string, quality: number): Promise<string> {
  logger.global.info(`Optimizing ${inputPath}`);
  const outputPath = temporary.directory();
  await sharpAsync({
    input: inputPath,
    output: outputPath,
    quality,
  });
  return path.join(outputPath, path.basename(inputPath));
}

export type OptimizationOptions = {
  quality: number;
  include?: string;
  exclude?: string;
  save?: boolean;
};

export type AssetOptimizationState = { [hash: string]: boolean };

/*
 * Returns a boolean indicating whether or not there are assets to optimize
 */
export async function hasUnoptimizedAssetsAsync(
  projectDir: string,
  options: OptimizationOptions
): Promise<boolean> {
  if (!fs.existsSync(path.join(projectDir, '.expo-shared/assets.json'))) {
    return true;
  }
  const { selectedFiles } = await getAssetFilesAsync(projectDir, options);
  const { assetInfo } = await readAssetJsonAsync(projectDir);

  for (const file of selectedFiles) {
    const hash = calculateHash(file);
    if (!assetInfo[hash]) {
      return true;
    }
  }

  return false;
}

/*
 * Find all project assets under assetBundlePatterns in app.json excluding node_modules.
 * If --include of --exclude flags were passed in those results are filtered out.
 */
export async function getAssetFilesAsync(
  projectDir: string,
  options: OptimizationOptions
): Promise<{ allFiles: string[]; selectedFiles: string[] }> {
  const { exp } = await readConfigJsonAsync(projectDir);
  const { assetBundlePatterns } = exp;
  const globOptions = {
    cwd: projectDir,
    ignore: ['**/node_modules/**', '**/ios/**', '**/android/**'],
  };

  // All files must be returned even if flags are passed in to properly update assets.json
  const allFiles: string[] = [];
  const patterns = assetBundlePatterns || ['**/*'];
  patterns.forEach((pattern: string) => {
    allFiles.push(...glob.sync(pattern, globOptions));
  });
  // If --include is passed in, only return files matching that pattern
  const included =
    options && options.include ? [...glob.sync(options.include, globOptions)] : allFiles;
  const toExclude = new Set();
  if (options && options.exclude) {
    glob.sync(options.exclude, globOptions).forEach(file => toExclude.add(file));
  }
  // If --exclude is passed in, filter out files matching that pattern
  const excluded = included.filter(file => !toExclude.has(file));
  const filtered = options && options.exclude ? excluded : included;
  return {
    allFiles: filterImages(allFiles, projectDir),
    selectedFiles: filterImages(filtered, projectDir),
  };
}

/*
 * Formats an array of files to include the project directory and filters out PNGs and JPGs.
 */
function filterImages(files: string[], projectDir: string) {
  const regex = /\.(png|jpg|jpeg)$/;
  const withDirectory = files.map(file => `${projectDir}/${file}`.replace('//', '/'));
  const allImages = withDirectory.filter(file => regex.test(file.toLowerCase()));
  return allImages;
}

/*
 * Read the contents of assets.json under .expo-shared folder. Create the file/directory if they don't exist.
 */
export async function readAssetJsonAsync(
  projectDir: string
): Promise<{ assetJson: JsonFile<AssetOptimizationState>; assetInfo: AssetOptimizationState }> {
  const dirPath = path.join(projectDir, '.expo-shared');
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }

  const assetJson = new JsonFile<AssetOptimizationState>(path.join(dirPath, 'assets.json'));
  if (!fs.existsSync(assetJson.file)) {
    const message =
      `Creating ${chalk.italic('.expo-shared/assets.json')} in the project's root directory.\n` +
      `This file is autogenerated and should not be edited directly.\n` +
      'You should commit this to git so that asset state is shared between collaborators.';

    logger.global.info(message);

    await assetJson.writeAsync({});
  }
  const assetInfo = await assetJson.readAsync();
  return { assetJson, assetInfo };
}

/*
 * Add .orig extension to a filename in a path string
 */
export function createNewFilename(imagePath: string): string {
  const { dir, name, ext } = path.parse(imagePath);
  return path.join(dir, name + '.orig' + ext);
}
