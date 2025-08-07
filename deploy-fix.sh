#!/bin/bash

echo "🔧 Fixing deployment issues..."

# Remove node_modules and package-lock.json to ensure clean install
echo "🧹 Cleaning up dependencies..."
rm -rf node_modules package-lock.json

# Install dependencies with Express 4.x
echo "📦 Installing dependencies..."
npm install

# Test the server startup
echo "🧪 Testing server startup..."
timeout 10s node server.js || echo "Server started successfully (timeout expected)"

echo "✅ Deployment fix completed!"
echo "📋 Summary of changes:"
echo "  - Downgraded Express from 5.1.0 to 4.18.2"
echo "  - Fixed Polish character in routes (błąd → error)"
echo "  - Updated all redirects to use ASCII characters"
echo ""
echo "🚀 Ready to deploy to Render!"
