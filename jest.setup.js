jest.mock('mime', () => {
  const mockMime = {
    getType: jest.fn((extension) => {
      const mimeTypes = {
        '.txt': 'text/plain',
        '.json': 'application/json',
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      }
      return mimeTypes[extension] || 'application/octet-stream'
    }),
  }

  return {
    __esModule: true,
    default: mockMime,
    ...mockMime,
  }
})

jest.mock('sevenzip', () => {
  const mockSevenZip = {
    getFiles: jest.fn(),
    getSingleFile: jest.fn(),
    extractFile: jest.fn(),
  }

  function MockSevenZip() {
    return mockSevenZip
  }

  return {
    SevenZip: MockSevenZip,
  }
})
