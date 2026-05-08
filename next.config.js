/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg', 'openai', 'formidable', '@anthropic-ai/sdk', '@google/genai', '@prisma/client', 'prisma'],
  },
};

module.exports = nextConfig;
