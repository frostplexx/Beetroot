#!/usr/bin/env bun
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const version = '1.6.0';
const baseURL = `https://github.com/acoustid/chromaprint/releases/download/v${version}`;
const platform = process.platform;

// Canonical path where runtime expects fpcalc binary
const binDir = path.join(__dirname, '..', 'lib', 'music', 'binaries', 'chromaprint');

function download(downloadUrl) {
    console.log(`Downloading chromaprint from ${downloadUrl}...`);

    // Ensure target directory exists
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    const cmd = platform === 'win32'
        ? `curl -L -o chromaprint.zip ${downloadUrl} && unzip chromaprint.zip && rm chromaprint.zip`
        : `curl -L -o chromaprint.tar.gz ${downloadUrl} && tar -xzf chromaprint.tar.gz && mkdir -p ${binDir} && mv chromaprint-fpcalc-${version}-*/fpcalc ${binDir}/fpcalc && chmod +x ${binDir}/fpcalc && rm -rf chromaprint-fpcalc-${version}-* chromaprint.tar.gz`;

    exec(cmd, (error) => {
        if (error) {
            console.error(`Error downloading chromaprint: ${error}`);
            return;
        }
        console.log('chromaprint downloaded successfully to', binDir);
    });
}

exec('which fpcalc', (error) => {
    if (!error) return; // already installed

    console.log('fpcalc not found, downloading...');

    if (platform === 'win32') {
        download(`${baseURL}/chromaprint-fpcalc-${version}-windows-x86_64.zip`);
    } else if (platform === 'darwin') {
        download(`${baseURL}/chromaprint-fpcalc-${version}-macos-arm64.tar.gz`);
    } else {
        exec('uname -m', (error, stdout) => {
            if (error) {
                console.error(`Error checking architecture: ${error}`);
                return;
            }
            const arch = stdout.trim();
            if (arch === 'aarch64') {
                download(`${baseURL}/chromaprint-fpcalc-${version}-linux-arm64.tar.gz`);
            } else if (arch === 'x86_64') {
                download(`${baseURL}/chromaprint-fpcalc-${version}-linux-x86_64.tar.gz`);
            } else {
                console.error(`Unsupported architecture: ${arch}`);
            }
        });
    }
});
