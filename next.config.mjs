import { wgslTurbopackRule } from '@vgpu/wgsl/next'

/** @type {import('next').NextConfig} */

const isWebBuild = process.env.BUILD_TARGET === 'web'

const nextConfig = {
  output: 'export',

  // WGSL shaders (components/gfx) import as prepared vgpu modules, compiled at build time.
  turbopack: {
    rules: {
      '*.wgsl': wgslTurbopackRule({ minify: true }),
    },
  },
  webpack(config) {
    config.module.rules.push({ test: /\.wgsl$/, loader: '@vgpu/wgsl/loader-webpack', options: { minify: true } })
    return config
  },
  
  // Use relative paths for extension builds (default), standard paths for web/PWA
  assetPrefix: isWebBuild ? undefined : './',
  basePath: '',
  
  // Critical for browser extensions & static export
  images: {
    unoptimized: true,
  },
  
  trailingSlash: false,
  
  typescript: {
    ignoreBuildErrors: false,
  },
  
  reactStrictMode: true,
  
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  
  // Production source maps for debugging
  productionBrowserSourceMaps: false,
  
  // Disable powered by header
  poweredByHeader: false,
}

export default nextConfig
