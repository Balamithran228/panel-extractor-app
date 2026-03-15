# Panel Extractor App

## What is this app?
Panel Extractor is an offline-first mobile application built with React Native that allows users to extract, process, and manage text and panels locally on their devices. It is designed to provide seamless functionality without relying on an external backend, ensuring privacy and fast performance.

## What it does
- **Local Text Extraction**: Processes and extracts panels or text directly on the mobile device.
- **Offline Storage**: Uses local storage (SQLite or local file system) to save extracted data, ensuring it is always available.
- **Seamless UI/UX**: Offers an intuitive user interface for managing and reading extracted content.
- **Privacy First**: All processing and storage are done locally; no sensitive data is sent to external servers.

## Architecture
The application follows a local-first architecture:
1. **Frontend**: Built with React Native, providing a cross-platform mobile interface.
2. **Local Storage**: Utilizes local device storage (SQLite/File System APIs) for persisting app state and extracted data.
3. **Processing Engine**: A built-in logic layer in React Native that handles extraction and formatting without backend dependency.

## Implementation Guide

### Prerequisites
- Node.js (v18+)
- Java Development Kit (JDK 17)
- Android Studio (for Android development)
- Watchman (recommended for macOS)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Balamithran228/panel-extractor-app.git
   cd panel-extractor-app/frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Setup environment variables:
   - Create a `.env` file in the `frontend` root directory if needed (do not commit sensitive credentials). Ensure `frontend/android/local.properties` contains your local Android SDK path but isn't committed if it has sensitive info.

### Running the App (Android)
1. Ensure you have an Android device connected or an emulator running.
2. Start the Metro bundler:
   ```bash
   npm start
   ```
3. Run the application:
   ```bash
   npm run android
   ```

### Security Details
- **No Sensitive Data Committed**: Ensure that `local.properties`, `.env`, keystores, and other sensitive configuration files are excluded in `.gitignore`.
