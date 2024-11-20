# Xavia OTA Updates Server 

[![Tests](https://github.com/xavia-io/xavia-ota/actions/workflows/test.yml/badge.svg)](https://github.com/xavia-io/xavia-ota/actions/workflows/test.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/xaviaio/xavia-ota)](https://hub.docker.com/r/xaviaio/xavia-ota)
[![Docker Image Size](https://img.shields.io/docker/image-size/xaviaio/xavia-ota/latest)](https://hub.docker.com/r/xaviaio/xavia-ota)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A self-hosted Over-The-Air (OTA) updates server for Expo/RN applications that gives you complete control over your app's update distribution. Built with Next.js and TypeScript, it implements the expo-updates protocol while providing additional features for enterprise use.

## Table of Contents <!-- omit in toc -->


 
- [Xavia OTA Updates Server](#xavia-ota-updates-server)
  - [Overview](#overview)
  - [Key Features](#key-features)
  - [Deployment](#deployment)
  - [Local Development](#local-development)
  - [Code Signing](#code-signing)
  - [React Native app configuration](#react-native-app-configuration)
  - [Publish App Update](#publish-app-update)
  - [Rollbacks](#rollbacks)
  - [Admin Dashboard](#admin-dashboard)
  - [Technical Stack](#technical-stack)
    - [Core Technologies](#core-technologies)
    - [Storage Options](#storage-options)
    - [Development Tools](#development-tools)
  - [Community Contributions](#community-contributions)
  - [FAQ](#faq)
    - [How is this different from EAS Updates?](#how-is-this-different-from-eas-updates)
    - [How is this different from self-hosted CodePush server?](#how-is-this-different-from-self-hosted-codepush-server)
    - [Can I use this with bare React Native apps?](#can-i-use-this-with-bare-react-native-apps)
    - [What blob storage options are supported?](#what-blob-storage-options-are-supported)
    - [What database options are supported?](#what-database-options-are-supported)
    - [Is this production-ready?](#is-this-production-ready)
  - [License](#license)


## Overview

This system provides a robust OTA update infrastructure with these key components:

1. **Updates Server**: A Next.js application handling OTA update distribution.
2. **Admin Dashboard**: Web interface for update management.
3. **Blob Storage**: Flexible and extensible blob storage support.
4. **Database Layer**: Supports PostgreSQL for tracking (no sensitive or personal data is collected) and insights.

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

### Load test your deployment setup
Check [this](./docs/laod_testing.md) on how to run load testing for your OTA server in your deployment infrastructure.

## Local Development

1. Clone the repository and install dependencies:
   ```bash
   git clone git@github.com:xavia-io/xavia-ota.git
   cd xavia-ota
   npm install
   ```

2. Copy the example local env file:
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


## Code Signing 

The code signing is done using a private key. The private key is used to sign the updates. The client uses a certificate to verify the signature of the update.

To read more about code signing for your app and how you can generate the secrets, please refer to the [expo code signing documentation](https://docs.expo.dev/code-signing/code-signing-overview/).

## React Native app configuration 

To use the OTA updates in your React Native app, please refer to the [expo-updates configuration](https://docs.expo.dev/versions/latest/sdk/updates/).

## Publish App Update

We provide a simple script `build-and-publish-app-release.sh` in the `scripts` folder to build and publish your app updates, copy it to your RN app root folder and run it from there:

```shell
./build-and-publish-app-release.sh <runtimeVersion> <your-xavia-ota-url>
```

> **Important**: Make sure the runtime version is the same as the one you use in your expo-updates config in your app. 
> Refer to the [React Native app configuration](#react-native-app-configuration) for more information.

Example:
```shell
./build-and-publish-app-release.sh 1.0.0 http://localhost:3000
```

This script will:
1. Build your app using `expo export`
2. Package the update with metadata
3. Upload it to your Xavia OTA server

The script will show you the commit hash and message for confirmation before uploading.

> **Note**: Make sure the script is executable (`chmod +x scripts/build-and-publish-app-release.sh`)

## Rollbacks

We use a simple rollback-forward mechanism. When a new update is published, it becomes the "active" update and the previous update, let's call it "inactive" update, is still available in your server but not served to the clients. 

If anything goes wrong with the active update, and you want to rollback to the inactive one, you can simply click a button in the admin dashboard. 

What happens behind the scenes is that we copy the inactive update with a new timestamp and push it to the front of the queue of updates, effectively making it the new active update.

## Admin Dashboard

For more information about the admin dashboard, please refer to the [Admin Dashboard](./docs/adminPortal.md) documentation.

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


## Community Contributions

We welcome and appreciate contributions from the community to enhance and expand the capabilities of the Xavia OTA System. Here are some areas where you can contribute:

- **New Storage Backends**: Implement additional storage backends to provide more options for users.
- **Database Support**: Add support for other databases like MySQL, MongoDB, etc.
- **UI Enhancements**: Improve the Admin Dashboard with new features and better user experience.
- **Documentation**: Help us improve the documentation to make it easier for others to get started and use the system.
- **Bug Fixes and Improvements**: Identify and fix bugs, and suggest improvements to the existing codebase.

Feel free to fork the repository, make your changes, and submit a pull request. We look forward to your contributions!

## FAQ

<details>
<summary>

### How is this different from EAS Updates?
</summary>
Xavia OTA is a free, self-hosted alternative to EAS Updates. While EAS Updates is a managed service that costs massively for growing apps, Xavia OTA can be deployed anywhere and is completely free. Both implement the same expo-updates protocol.
</details>

<details>
<summary>

### How is this different from self-hosted CodePush server?
</summary>

The self-hosted CodePush server is tightly coupled with the Azure ecosystem and requires Azure App Service & Azure Blob Storage for production deployments and an Azurite emulator for local development. 


Xavia OTA, on the other hand, is completely independent and can be deployed anywhere - whether that's your own infrastructure, AWS, GCP, or any other cloud provider. Additionally, Xavia OTA implements the expo-updates protocol which is more widely adopted in the React Native ecosystem compared to CodePush's protocol.

</details>

<details>
<summary>

### Can I use this with bare React Native apps?
</summary>

This a "yes and no" type of answer. While you can use Xavia OTA with bare React Native apps, you need to configure expo-updates in your app and point it to your Xavia OTA server. Unfortunately, that means you will also need to add a small footprint of the Expo framework to your app as well.

So the "yes" part is for the ability to use Xavia OTA updates with bare React Native apps that haven't been created with Expo, and the "no" part is for the fact that you will need to ship the Expo SDK with your app from now on. The good thing is that you will not need to use any managed Expo services like EAS Build or EAS Submit to use expo-updates in your RN app with Xavia OTA.

> [!NOTE]  This is fun!
> This problem might be worth working on by the community. The expo-updates protocol is designed to be agnostic to the underlying SDK that you use to build your app. So it should work with any RN app - no matter how bare-bones it is. The only client-side implementation for expo-updates protocol that we know of is the one made by Expo themselves. Xavia OTA implements the expo-updates protocol on the server side and we would love to see the same on the client side. If you are interested in working on this, here are some pointers:


1. Expo-updates [protocol specification](https://docs.expo.dev/archive/technical-specs/expo-updates-0/)
2. Expo-updates [client implementation](https://github.com/expo/expo/tree/main/packages/expo-updates)


</details>

<details>
<summary>

### What blob storage options are supported?
</summary>

Currently, we support:
- Supabase Storage
- Local filesystem storage

More providers (S3, Azure, etc.) are welcome to be implemented by the community. The `StorageInterface` is quite simple and you can implement it for any blob storage service.
</details>

<details>
<summary>

### What database options are supported?
</summary>

Currently, we support:
- PostgreSQL

More providers (MySQL, MongoDB, etc.) are welcome to be implemented by the community. The `DatabaseInterface` is quite simple and you can implement it for any database service.
</details>

<details>
<summary>

### Is this production-ready?
</summary>

Yes! We're using it in production for our own apps. The server implements the complete expo-updates protocol and includes features like release management and rollbacks and simple tracking metrics.
</details>


## License
This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
