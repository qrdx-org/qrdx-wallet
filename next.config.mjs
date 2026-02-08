/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  
  // Use relative paths for browser extension compatibility
  assetPrefix: './',
  basePath: '',
  
  // Critical for browser extensions
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
