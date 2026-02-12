/** @type {import('next').NextConfig} */

const isExtensionBuild = process.env.BUILD_TARGET === 'extension'

const nextConfig = {
  output: 'export',
  
  // Use relative paths only for browser extension builds
  assetPrefix: isExtensionBuild ? './' : undefined,
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
