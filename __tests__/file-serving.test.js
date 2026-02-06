const { TestFileSystem, MockResponse, createMockRequest } = require('../test-utils')
const api = require('../api.js')

describe('File Serving with MIME Type Detection', () => {
  let testFs
  let mockResponse
  let handler

  beforeEach(() => {
    testFs = new TestFileSystem()
    mockResponse = new MockResponse()
    handler = api(testFs.getTempPath())
  })

  afterEach(() => {
    testFs.cleanup()
  })

  describe('MIME Type Detection', () => {
    test('should detect correct MIME type for text files', async () => {
      testFs.createFile('document.txt', 'text content')
      const req = createMockRequest({ url: '/document.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toContain('text/plain')
      expect(mockResponse.statusCode).toBe(200)
    })

    test('should detect correct MIME type for JSON files', async () => {
      testFs.createFile('data.json', '{"key": "value"}')
      const req = createMockRequest({ url: '/data.json' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toContain('application/json')
      expect(mockResponse.statusCode).toBe(200)
    })

    test('should detect correct MIME type for HTML files', async () => {
      testFs.createFile('index.html', '<html><body>Test</body></html>')
      const req = createMockRequest({ url: '/index.html' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toContain('text/html')
      expect(mockResponse.statusCode).toBe(200)
    })

    test('should detect correct MIME type for CSS files', async () => {
      testFs.createFile('styles.css', 'body { color: red; }')
      const req = createMockRequest({ url: '/styles.css' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toContain('text/css')
      expect(mockResponse.statusCode).toBe(200)
    })

    test('should detect correct MIME type for JavaScript files', async () => {
      testFs.createFile('script.js', 'console.log("hello");')
      const req = createMockRequest({ url: '/script.js' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toContain('application/javascript')
      expect(mockResponse.statusCode).toBe(200)
    })

    test('should detect correct MIME type for PDF files', async () => {
      testFs.createFile('document.pdf', 'pdf content')
      const req = createMockRequest({ url: '/document.pdf' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toContain('application/pdf')
      expect(mockResponse.statusCode).toBe(200)
    })

    test('should detect correct MIME type for images', async () => {
      testFs.createFile('image.jpg', 'image content')
      testFs.createFile('photo.png', 'png content')
      testFs.createFile('graphic.gif', 'gif content')
      testFs.createFile('webp-image.webp', 'webp content')

      const jpgReq = createMockRequest({ url: '/image.jpg' })
      const pngReq = createMockRequest({ url: '/photo.png' })
      const gifReq = createMockRequest({ url: '/graphic.gif' })
      const webpReq = createMockRequest({ url: '/webp-image.webp' })

      await handler(jpgReq, mockResponse)
      expect(mockResponse.getHeader('content-type')).toContain('image/jpeg')

      await handler(pngReq, mockResponse)
      expect(mockResponse.getHeader('content-type')).toContain('image/png')

      await handler(gifReq, mockResponse)
      expect(mockResponse.getHeader('content-type')).toContain('image/gif')

      await handler(webpReq, mockResponse)
      expect(mockResponse.getHeader('content-type')).toContain('image/webp')
    })

    test('should handle files without extensions', async () => {
      testFs.createFile('README', 'readme content')
      const req = createMockRequest({ url: '/README' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toBeTruthy()
      expect(mockResponse.statusCode).toBe(200)
    })

    test('should handle multiple extensions', async () => {
      testFs.createFile('archive.tar.gz', 'compressed content')
      const req = createMockRequest({ url: '/archive.tar.gz' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toBeTruthy()
      expect(mockResponse.statusCode).toBe(200)
    })

    test('should handle uppercase file extensions', async () => {
      testFs.createFile('DOCUMENT.TXT', 'uppercase content')
      testFs.createFile('IMAGE.JPG', 'image content')
      testFs.createFile('DATA.JSON', '{"data": "value"}')

      const txtReq = createMockRequest({ url: '/DOCUMENT.TXT' })
      const jpgReq = createMockRequest({ url: '/IMAGE.JPG' })
      const jsonReq = createMockRequest({ url: '/DATA.JSON' })

      await handler(txtReq, mockResponse)
      expect(mockResponse.getHeader('content-type')).toContain('text/plain')

      await handler(jpgReq, mockResponse)
      expect(mockResponse.getHeader('content-type')).toContain('image/jpeg')

      await handler(jsonReq, mockResponse)
      expect(mockResponse.getHeader('content-type')).toContain('application/json')
    })
  })

  describe('File Serving Headers', () => {
    test('should set Last-Modified header for files', async () => {
      const filePath = testFs.createFile('test.txt', 'content')
      const fileStats = testFs.getFileStats('test.txt')
      const req = createMockRequest({ url: '/test.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('last-modified')).toBe(
        new Date(fileStats.mtimeMs).toUTCString()
      )
    })

    test('should set Content-Length header for files', async () => {
      testFs.createFile('test.txt', '12345')
      const req = createMockRequest({ url: '/test.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-length')).toBe('5')
    })

    test('should set Accept-Ranges header for files', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({ url: '/test.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('accept-ranges')).toBe('bytes')
    })

    test('should set inline Content-Disposition by default', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({ url: '/test.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-disposition')).toBe('inline; filename="test.txt"')
    })

    test('should set attachment Content-Disposition when download=true', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt?download=true',
      })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-disposition')).toBe('attachment; filename="test.txt"')
    })

    test('should set inline Content-Disposition when download=false', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt?download=false',
      })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-disposition')).toBe('inline; filename="test.txt"')
    })

    test('should escape quotes in filename for Content-Disposition', async () => {
      testFs.createFile('file "with quotes".txt', 'content')
      const req = createMockRequest({ url: '/file%20%22with%20quotes%22.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-disposition')).toBe(
        'inline; filename="file "with quotes".txt"'
      )
    })
  })

  describe('File Content Serving', () => {
    test('should serve text file content', async () => {
      const content = 'This is test content for a text file.'
      testFs.createFile('test.txt', content)
      const req = createMockRequest({ url: '/test.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-type')).toContain('text/plain')
    })

    test('should serve binary file content', async () => {
      const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      testFs.createFile('test.png', binaryContent)
      const req = createMockRequest({ url: '/test.png' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-type')).toContain('image/png')
    })

    test('should serve empty file', async () => {
      testFs.createFile('empty.txt', '')
      const req = createMockRequest({ url: '/empty.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-length')).toBe('0')
    })

    test('should serve single byte file', async () => {
      testFs.createFile('single.txt', 'A')
      const req = createMockRequest({ url: '/single.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-length')).toBe('1')
    })

    test('should serve large file', async () => {
      testFs.createLargeFile('large.txt', 100000)
      const req = createMockRequest({ url: '/large.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-length')).toBe('100000')
    })
  })

  describe('File Path Handling', () => {
    test('should serve files with spaces in name', async () => {
      testFs.createFile('file with spaces.txt', 'content')
      const req = createMockRequest({ url: '/file%20with%20spaces.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-type')).toContain('text/plain')
    })

    test('should serve files with special characters in name', async () => {
      testFs.createFile('file-with.special_chars&symbols.txt', 'content')
      const req = createMockRequest({ url: '/file-with.special_chars&symbols.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-type')).toContain('text/plain')
    })

    test('should serve files in subdirectories', async () => {
      testFs.createDirectory('subdir')
      testFs.createFile('subdir/nested.txt', 'nested content')
      const req = createMockRequest({ url: '/subdir/nested.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-type')).toContain('text/plain')
    })

    test('should serve files in deeply nested directories', async () => {
      testFs.createDirectory('level1')
      testFs.createDirectory('level1/level2')
      testFs.createDirectory('level1/level2/level3')
      testFs.createFile('level1/level2/level3/deep.txt', 'deep content')
      const req = createMockRequest({ url: '/level1/level2/level3/deep.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-type')).toContain('text/plain')
    })

    test('should handle Unicode filenames', async () => {
      testFs.createFile('файл.txt', 'unicode content')
      const req = createMockRequest({ url: '/файл.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-type')).toContain('text/plain')
    })
  })

  describe('File Request with Actions', () => {
    test('should return file stats when action=stat', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt?action=stat',
      })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.filename).toBe('test.txt')
      expect(response.directory).toBe(false)
      expect(response.size).toBe(7)
      expect(mockResponse.statusCode).toBe(200)
    })

    test('should ignore other actions for regular files', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt?action=unknown',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-type')).toContain('text/plain')
    })

    test('should serve file with both action and download parameters', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt?action=stat&download=true',
      })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.filename).toBe('test.txt')
      expect(response.directory).toBe(false)
    })
  })

  describe('Method Handling for File Serving', () => {
    test('should handle HEAD requests for files', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        method: 'HEAD',
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.body).toBe('')
    })

    test('should handle OPTIONS requests for files', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        method: 'OPTIONS',
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.body).toBe('')
    })

    test('should reject POST requests for files', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(400)
      expect(mockResponse.body).toBe('')
    })

    test('should reject PUT requests for files', async () => {
      const req = createMockRequest({
        method: 'PUT',
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(400)
      expect(mockResponse.body).toBe('')
    })

    test('should reject DELETE requests for files', async () => {
      const req = createMockRequest({
        method: 'DELETE',
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(400)
      expect(mockResponse.body).toBe('')
    })
  })

  describe('Error Handling for File Serving', () => {
    test('should handle non-existent file', async () => {
      const req = createMockRequest({ url: '/nonexistent.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
    })

    test('should handle permission errors', async () => {
      const req = createMockRequest({ url: '/root/.ssh/id_rsa' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
    })

    test('should handle directory request as file', async () => {
      testFs.createDirectory('not-a-file')
      const req = createMockRequest({ url: '/not-a-file' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-type')).toContain('application/json')
    })
  })
})
