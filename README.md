# Xavia OTA Updates Server

[![Tests](https://github.com/xavia-io/xavia-ota/actions/workflows/test.yml/badge.svg)](https://github.com/xavia-io/xavia-ota/actions/workflows/test.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/xaviaio/xavia-ota)](https://hub.docker.com/r/xaviaio/xavia-ota)
[![Docker Image Size](https://img.shields.io/docker/image-size/xaviaio/xavia-ota/latest)](https://hub.docker.com/r/xaviaio/xavia-ota)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A self-hosted Over-The-Air (OTA) updates server for Expo applications that gives you complete control over your app's update distribution. Built with Next.js and TypeScript, it implements the expo-updates protocol while providing additional features for enterprise use.

## 📑 Table of Contents

- [Xavia OTA Updates Server](#xavia-ota-updates-server)
  - [📑 Table of Contents](#-table-of-contents)
  - [Overview](#overview)
  - [Key Features](#key-features)
  - [Deployment](#deployment)
  - [Local Development](#local-development)
  - [Technical Stack](#technical-stack)
    - [Core Technologies](#core-technologies)
    - [Storage Options](#storage-options)
    - [Development Tools](#development-tools)
  - [Code Signing](#code-signing)
  - [React Native expo-updates configuration](#react-native-expo-updates-configuration)
  - [Community Contributions](#community-contributions)
  - [License](#license)


## Overview

This system provides a robust OTA update infrastructure with these key components:

1. **Updates Server**: A Next.js application handling OTA update distribution.
2. **Admin Dashboard**: Web interface for update management.
3. **Blob Storage**: Flexible and extensible blob storage support.
4. **Database Layer**: Supports PostgreSQL for tracking (no sensitive or personaldata is collected) and insights.

## Key Features

- ✨ Full compatibility with `expo-updates` protocol - Seamlessly integrates with Expo applications using the standard update protocol.

- 🔄 Runtime version management and rollback support - Manage different app versions and quickly rollback to previous versions if issues arise.

- 🐳 Docker support for easy deployment - Get up and running quickly with containerized deployment using Docker and Docker Compose.

- 🗄️ Multiple blob storage backends:
  Abstracted blob storage interface that allows you to plug in your own storage solutions. Implement the simple interface to integrate with any storage backend of your choice.

- 📈 Release history tracking - Keep track of all your releases with detailed metadata including timestamps, commit hashes and commit messages.

- 📊 Insights - Get insights into your update distribution with detailed analytics.


## Deployment

The easiest way to deploy Xavia OTA is using our public Docker image. The image is available on Docker Hub at [xaviaio/xavia-ota](https://hub.docker.com/repository/docker/xaviaio/xavia-ota).

1. You can copy the `docker-compose.yml` file in the `containers/prod` folder and set the environment variables properly. 
2. Or if you like the longer route, you can pull the image and run it manually

    ` docker run -d -p 3000:3000 xaviaio/xavia-ota -e HOST=http://localhost:3000 ...`


## Local Development

1. Clone the repository and install dependencies:
   ```bash
   git clone git@github.com:xavia-io/xavia-ota.git
   cd xavia-ota
   npm install
   ```

2. Copy the example environment file and configure your variables:
   ```bash
   cp .env.example.local .env.local
   ```

3. Configure your environment variables in `.env.local`. The minimal required configuration is:
   ```env
   HOST=http://localhost:3000
   BLOB_STORAGE_TYPE=local
   DB_TYPE=postgres
   ADMIN_PASSWORD=your-admin-password
   PRIVATE_KEY_BASE_64=your-base64-encoded-private-key
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DB=releases_db
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

The server and admin dashboard will be available at `http://localhost:3000`.


Refer to [Storage & Database Configuration](./docs/supportedStorageAlternatives.md) for more configuration options.




## Technical Stack

### Core Technologies
- **Framework**: Next.js 15+
- **Language**: TypeScript
- **Database**: PostgreSQL 14
- **UI Library**: Chakra UI (v2) and Tailwind CSS for styling
- **Container**: Docker & Docker Compose

### Storage Options
- Local filesystem storage for development
- Supabase storage for production deployments
  
Read more about supported blob storage and database options [here](./docs/supportedStorageAlternatives.md).



### Development Tools
- ESLint for code quality
- Jest for testing
- Docker for containerization
- Make for development scripts

## Code Signing 

The code signing is done using a private key. The private key is used to sign the updates and is stored in the blob storage. The client uses a certificate to verify the signature of the update.

To read more about code signing for your app, please refer to the [expo code signing documentation](https://docs.expo.dev/code-signing/code-signing-overview/).

## React Native expo-updates configuration 

To use the OTA updates in your React Native app, please refer to the [expo-updates configuration](https://docs.expo.dev/versions/latest/sdk/updates/).

## Community Contributions

We welcome and appreciate contributions from the community to enhance and expand the capabilities of the Xavia OTA System. Here are some areas where you can contribute:

- **New Storage Backends**: Implement additional storage backends to provide more options for users.
- **Database Support**: Add support for other databases like MySQL, MongoDB, etc.
- **UI Enhancements**: Improve the Admin Dashboard with new features and better user experience.
- **Documentation**: Help us improve the documentation to make it easier for others to get started and use the system.
- **Bug Fixes and Improvements**: Identify and fix bugs, and suggest improvements to the existing codebase.

Feel free to fork the repository, make your changes, and submit a pull request. We look forward to your contributions!

## License
This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
