#!/usr/bin/env node

/**
 * Build script for browser extension using Next.js
 * This script builds the extension for both Chrome and Firefox with proper CSP compliance
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Directories
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

// Extension manifest templates
const chromeManifest = {
  manifest_version: 3,
  name: 'QRDX Wallet',
  version: '1.0.0',
  description: 'Quantum Resistant Multi-Platform Wallet',
  permissions: ['storage', 'activeTab'],
  host_permissions: [],
  action: {
    default_popup: 'popup/index.html',
    default_icon: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },
  background: {
    service_worker: 'background/background.js',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['content/content.js'],
      run_at: 'document_idle',
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self' 'unsafe-inline';",
  },
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  web_accessible_resources: [
    {
      resources: ['popup/*'],
      matches: ['<all_urls>'],
    },
  ],
};

const firefoxManifest = {
  manifest_version: 2,
  name: 'QRDX Wallet',
  version: '1.0.0',
  description: 'Quantum Resistant Multi-Platform Wallet',
  permissions: ['storage', 'activeTab'],
  browser_action: {
    default_popup: 'popup/index.html',
    default_icon: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },
  background: {
    scripts: ['background/background.js'],
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['content/content.js'],
      run_at: 'document_idle',
    },
  ],
  content_security_policy: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self' 'unsafe-inline';",
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  web_accessible_resources: ['popup/*'],
};

function log(message) {
  console.log(`[build-extension] ${message}`);
}

function cleanDist() {
  log('Cleaning dist directory...');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });
}

function buildWithNext() {
  log('Building with Next.js for browser extension...');
  
  try {
    execSync('pnpm next build', {
      cwd: rootDir,
      stdio: 'inherit',
      env: { 
        ...process.env, 
        NODE_ENV: 'production', 
        NEXT_TELEMETRY_DISABLED: '1',
        TURBOPACK: '0'
      }
    });
    log('Next.js build completed');
  } catch (error) {
    log('Error building with Next.js');
    throw error;
  }
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;

  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((file) => {
      copyRecursive(path.join(src, file), path.join(dest, file));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function findHTMLFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    entries.forEach(entry => {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        files.push(fullPath);
      }
    });
  }
  
  traverse(dir);
  return files;
}

function processHTMLFiles(dir) {
  log('Processing HTML files for CSP compliance...');
  
  const htmlFiles = findHTMLFiles(dir);
  
  htmlFiles.forEach(htmlFile => {
    let content = fs.readFileSync(htmlFile, 'utf-8');
    const htmlDir = path.dirname(htmlFile);
    const relName = path.relative(dir, htmlFile).replace(/\.html$/, '').replace(/[\/\\]/g, '-');
    
    // Convert absolute paths to relative paths for extension compatibility
    content = content.replace(/href="\/_next\//g, 'href="./_next/');
    content = content.replace(/src="\/_next\//g, 'src="./_next/');
    content = content.replace(/href="\/logo\.png"/g, 'href="./logo.png"');
    content = content.replace(/src="\/logo\.png"/g, 'src="./logo.png"');
    
    // Remove inline event handlers that violate CSP
    content = content.replace(/\son\w+="[^"]*"/gi, '');
    
    // Remove font preload links that cause warnings in extensions
    content = content.replace(/<link[^>]*rel="preload"[^>]*as="font"[^>]*\/?>/gi, '');
    
    // ── Extract inline <script>...</script> into separate .js files ──
    // This is critical: Chrome MV3 extensions block ALL inline scripts.
    // We find every <script> that has a body (no src=), extract its
    // content to an external .js file, and replace with <script src=...>.
    const inlineScriptDir = path.join(htmlDir, '_csp_scripts');
    let scriptIndex = 0;
    
    content = content.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, body) => {
      // If it already has a src attribute, leave it alone
      if (/\bsrc\s*=/i.test(attrs)) {
        return match;
      }
      // If the body is empty, skip
      const trimmed = body.trim();
      if (!trimmed) {
        return match;
      }
      
      // Create the output directory on first use
      if (!fs.existsSync(inlineScriptDir)) {
        fs.mkdirSync(inlineScriptDir, { recursive: true });
      }
      
      const filename = `${relName}-inline-${scriptIndex++}.js`;
      const filePath = path.join(inlineScriptDir, filename);
      fs.writeFileSync(filePath, trimmed);
      
      // Build the relative path from the HTML file to the script
      const relPath = path.relative(htmlDir, filePath).replace(/\\/g, '/');
      
      // Preserve any other attributes (e.g. type, id, nomodule)
      return `<script${attrs} src="./${relPath}"></script>`;
    });
    
    fs.writeFileSync(htmlFile, content);
    log(`Processed ${path.relative(dir, htmlFile)} (extracted ${scriptIndex} inline script${scriptIndex !== 1 ? 's' : ''})`);
  });
}

function copyNextOutput(targetDir) {
  log(`Copying Next.js output to ${targetDir}...`);
  const outDir = path.join(rootDir, 'out');
  
  if (!fs.existsSync(outDir)) {
    log('Error: Next.js out directory not found. Make sure output: "export" is set in next.config.mjs');
    throw new Error('Next.js build output not found');
  }

  // Create popup directory
  const popupDir = path.join(targetDir, 'popup');
  fs.mkdirSync(popupDir, { recursive: true });

  // Copy Next.js output to popup directory
  copyRecursive(outDir, popupDir);
  
  // Post-process HTML to ensure CSP compliance
  processHTMLFiles(popupDir);
}

function createExtensionScripts(targetDir) {
  log('Creating extension scripts...');
  
  // Create background directory
  const backgroundDir = path.join(targetDir, 'background');
  fs.mkdirSync(backgroundDir, { recursive: true });
  
  // Create background script with proper error handling
  const backgroundScript = `// QRDX Wallet Background Script
'use strict';

console.log('QRDX Wallet background script loaded');

// Initialize wallet on install
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener((details) => {
    console.log('QRDX Wallet installed', details.reason);
    
    // Initialize default settings
    chrome.storage.local.set({
      initialized: true,
      version: '1.0.0',
      installDate: new Date().toISOString(),
    });
  });

  // Handle messages from popup/content scripts
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received:', request);
    
    // Handle different message types
    switch (request.type) {
      case 'PING':
        sendResponse({ success: true, message: 'pong' });
        break;
      
      case 'GET_WALLET_STATE':
        // Add wallet state logic here
        chrome.storage.local.get(['walletState'], (result) => {
          sendResponse({ success: true, data: result.walletState });
        });
        return true; // Will respond asynchronously
      
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
    
    return true; // Keep channel open for async response
  });
}`;

  fs.writeFileSync(
    path.join(backgroundDir, 'background.js'),
    backgroundScript
  );

  // Create content directory
  const contentDir = path.join(targetDir, 'content');
  fs.mkdirSync(contentDir, { recursive: true });

  // Create content script with Web3 provider injection capability
  const contentScript = `// QRDX Wallet Content Script
'use strict';

console.log('QRDX Wallet content script loaded');

// Inject QRDX provider into page context
(function() {
  // Create QRDX provider object
  const qrdxProvider = {
    isQRDX: true,
    version: '1.0.0',
    
    // Add provider methods here
    request: async (args) => {
      // Send message to background script
      return new Promise((resolve, reject) => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage(
            { type: 'PROVIDER_REQUEST', payload: args },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (response.success) {
                resolve(response.data);
              } else {
                reject(new Error(response.error || 'Unknown error'));
              }
            }
          );
        } else {
          reject(new Error('Extension not available'));
        }
      });
    },
  };
  
  // Inject into window
  if (typeof window !== 'undefined') {
    window.qrdx = qrdxProvider;
    
    // Dispatch event to notify page
    window.dispatchEvent(new Event('qrdx#initialized'));
  }
})();`;

  fs.writeFileSync(
    path.join(contentDir, 'content.js'),
    contentScript
  );
}

function createIcons(targetDir) {
  log('Creating resized icons from logo.png...');
  const iconsDir = path.join(targetDir, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  
  const logoPath = path.join(rootDir, 'assets', 'logo.png');
  
  if (!fs.existsSync(logoPath)) {
    log('Warning: logo.png not found in assets/');
    return;
  }
  
  const sizes = [16, 48, 128];
  sizes.forEach(size => {
    const iconPath = path.join(iconsDir, `icon${size}.png`);
    try {
      // Use ImageMagick convert to resize the logo
      execSync(
        `convert "${logoPath}" -resize ${size}x${size} "${iconPath}"`,
        { stdio: 'pipe' }
      );
      log(`Created icon${size}.png`);
    } catch (error) {
      // Fallback: just copy the original if ImageMagick is not available
      log(`ImageMagick not available, copying original logo for icon${size}.png`);
      fs.copyFileSync(logoPath, iconPath);
    }
  });
  
  log('Icons created successfully');
}

function writeManifest(targetDir, manifest, filename = 'manifest.json') {
  log(`Writing ${filename}...`);
  fs.writeFileSync(
    path.join(targetDir, filename),
    JSON.stringify(manifest, null, 2)
  );
}

function buildForBrowser(browser) {
  log(`Building for ${browser}...`);
  const targetDir = path.join(distDir, browser);
  fs.mkdirSync(targetDir, { recursive: true });

  // Copy Next.js output
  copyNextOutput(targetDir);

  // Create extension scripts
  createExtensionScripts(targetDir);

  // Create icons
  createIcons(targetDir);

  // Write manifest
  const manifest = browser === 'chrome' ? chromeManifest : firefoxManifest;
  writeManifest(targetDir, manifest);

  log(`${browser} extension built successfully`);
}

async function main() {
  try {
    log('Starting extension build process...');
    
    // Clean dist directory
    cleanDist();

    // Build with Next.js
    buildWithNext();

    // Build for Chrome
    buildForBrowser('chrome');

    // Build for Firefox
    buildForBrowser('firefox');

    log('✅ Extension build completed successfully!');
    log('');
    log('Output directories:');
    log(`  Chrome:  ${path.join(distDir, 'chrome')}`);
    log(`  Firefox: ${path.join(distDir, 'firefox')}`);
    log('');
    log('To load the extension:');
    log('  Chrome:  Open chrome://extensions, enable Developer mode, click "Load unpacked", select dist/chrome');
    log('  Firefox: Open about:debugging, click "Load Temporary Add-on", select dist/firefox/manifest.json');
    log('');
    log('To package the extensions, run:');
    log('  pnpm extension:package:chrome');
    log('  pnpm extension:package:firefox');
  } catch (error) {
    log('❌ Build failed');
    console.error(error);
    process.exit(1);
  }
}

main();
