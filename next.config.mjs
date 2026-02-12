/** @type {import('next').NextConfig} */

const isWebBuild = process.env.BUILD_TARGET === 'web'

const nextConfig = {
  output: 'export',
  
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
