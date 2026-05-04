#!/usr/bin/env node
/**
 * Fetches the real CKAN-meta registry archive from GitHub,
 * extracts all .ckan mod metadata files, and outputs a
 * consolidated registry.json for the frontend to consume.
 */

import https from 'https';
import { createGunzip } from 'zlib';
import { extract } from 'tar-stream';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const REGISTRY_URL = 'https://github.com/KSP-CKAN/CKAN-meta/archive/master.tar.gz';
const OUTPUT_DIR = join(__dirname, '..', 'public');
const OUTPUT_FILE = join(OUTPUT_DIR, 'registry.json');

function followRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'CKAN-Modern/2.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(followRedirects(res.headers.location, maxRedirects - 1));
      } else if (res.statusCode === 200) {
        resolve(res);
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

async function fetchRegistry() {
  console.log('Downloading CKAN-meta registry...');
  const response = await followRedirects(REGISTRY_URL);

  const modules = {};       // identifier -> { versions: { ver: metadata } }
  let downloadCounts = {};
  let knownVersions = [];
  let fileCount = 0;

  return new Promise((resolve, reject) => {
    const extractor = extract();

    extractor.on('entry', (header, stream, next) => {
      let data = '';
      stream.on('data', (chunk) => { data += chunk.toString(); });
      stream.on('end', () => {
        const name = header.name;

        if (name.endsWith('.ckan') && !name.endsWith('.frozen')) {
          try {
            const mod = JSON.parse(data);
            const id = mod.identifier;
            if (id) {
              if (!modules[id]) {
                modules[id] = {
                  identifier: id,
                  name: mod.name || id,
                  abstract: mod.abstract || '',
                  author: Array.isArray(mod.author) ? mod.author : [mod.author || 'Unknown'],
                  license: Array.isArray(mod.license) ? mod.license : [mod.license || 'unknown'],
                  tags: mod.tags || [],
                  resources: mod.resources || {},
                  versions: {},
                };
              }
              const ver = mod.version || '0.0.0';
              modules[id].versions[ver] = {
                version: ver,
                download: mod.download || null,
                download_size: mod.download_size || 0,
                install_size: mod.install_size || 0,
                ksp_version: mod.ksp_version || null,
                ksp_version_min: mod.ksp_version_min || null,
                ksp_version_max: mod.ksp_version_max || null,
                release_date: mod.release_date || null,
                depends: mod.depends || [],
                recommends: mod.recommends || [],
                conflicts: mod.conflicts || [],
                description: mod.description || mod.abstract || '',
                kind: mod.kind || 'package',
              };
              fileCount++;
            }
          } catch (e) {
            // skip malformed .ckan files
          }
        } else if (name.endsWith('download_counts.json')) {
          try { downloadCounts = JSON.parse(data); } catch (e) {}
        } else if (name.endsWith('builds.json')) {
          try { knownVersions = JSON.parse(data); } catch (e) {}
        }

        next();
      });
      stream.resume();
    });

    extractor.on('finish', () => {
      // For each module, pick the latest version as the "current" display version
      const moduleList = Object.values(modules).map((mod) => {
        const versionKeys = Object.keys(mod.versions);
        // Sort versions descending (simple string sort works for most cases)
        versionKeys.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
        const latestVer = versionKeys[0];
        const latest = mod.versions[latestVer] || {};

        return {
          identifier: mod.identifier,
          name: mod.name,
          abstract: mod.abstract,
          author: mod.author,
          license: mod.license,
          tags: mod.tags,
          resources: mod.resources,
          version: latestVer,
          download_size: latest.download_size,
          install_size: latest.install_size,
          ksp_version: latest.ksp_version,
          ksp_version_min: latest.ksp_version_min,
          ksp_version_max: latest.ksp_version_max,
          release_date: latest.release_date,
          depends: latest.depends,
          recommends: latest.recommends,
          conflicts: latest.conflicts,
          description: latest.description,
          download: latest.download,
          download_count: downloadCounts[mod.identifier] || 0,
          version_count: versionKeys.length,
          all_versions: versionKeys,
        };
      });

      // Sort by download count descending
      moduleList.sort((a, b) => b.download_count - a.download_count);

      const registry = {
        generated_at: new Date().toISOString(),
        module_count: moduleList.length,
        file_count: fileCount,
        modules: moduleList,
      };

      mkdirSync(OUTPUT_DIR, { recursive: true });
      writeFileSync(OUTPUT_FILE, JSON.stringify(registry));
      console.log(`Registry written: ${moduleList.length} modules from ${fileCount} .ckan files`);
      resolve(registry);
    });

    extractor.on('error', reject);
    response.pipe(createGunzip()).pipe(extractor);
  });
}

fetchRegistry().catch((err) => {
  console.error('Failed to fetch registry:', err);
  process.exit(1);
});
