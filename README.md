# Files API

A simple JSON file API over HTTP that serves files and directories with metadata.

## Features

- Serve files and directories as JSON
- Archive extraction (7z support)
- Range request support for large files
- Download vs inline display control
- MIME type detection

## Installation

```bash
npm install
```

## Usage

Start the server:
```bash
npm start
```

Development mode with file watching:
```bash
npm run dev
```

The server will start on port 8087 (or use PORT environment variable).

## API Endpoints

- `GET /path/to/file` - Serve file content
- `GET /path/to/directory` - List directory contents as JSON
- `GET /path/to/file?action=stat` - Get file metadata as JSON
- `GET /path/to/archive?action=contents` - List archive contents
- `GET /path/to/archive?action=extract&extract=inner/file.txt` - Extract file from archive

## Query Parameters

- `download=true` - Force download as attachment
- `action=stat` - Return file metadata
- `action=contents` - List archive contents
- `action=extract&extract=path` - Extract specific file from archive

## Docker

```bash
make build
make publish
```

## Development

```bash
make lint      # Run ESLint
make format    # Format code with Prettier
make dev       # Start development server
```