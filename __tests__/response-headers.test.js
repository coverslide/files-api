const { TestFileSystem, MockResponse, createMockRequest } = require('../test-utils')
const api = require('../api.js')

describe('Range Request Response Headers', () => {
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

  describe('Regular Files - Response Headers', () => {
    test('should set correct Content-Range header for partial content', async () => {
      testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=100-299' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-range')).toBe('bytes 100-299/1000')
      expect(mockResponse.statusCode).toBe(206)
    })

    test('should set correct Content-Length for partial content', async () => {
      testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=100-299' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-length')).toBe('200')
    })

    test('should set correct Content-Range for suffix range', async () => {
      testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=500-' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-range')).toBe('bytes 500-999/1000')
      expect(mockResponse.getHeader('content-length')).toBe('500')
    })

    test('should set full content headers when no range requested', async () => {
      testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('accept-ranges')).toBe('bytes')
      expect(mockResponse.getHeader('content-length')).toBe('1000')
      expect(mockResponse.getHeader('content-range')).toBeUndefined()
    })

    test('should set correct Last-Modified header', async () => {
      const filePath = testFs.createFile('test.txt', 'content')
      const stats = testFs.getFileStats('test.txt')
      const req = createMockRequest({
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('last-modified')).toBe(new Date(stats.mtimeMs).toUTCString())
    })

    test('should set correct Content-Type based on file extension', async () => {
      testFs.createFile('test.pdf', 'pdf content')
      testFs.createFile('test.jpg', 'image content')
      testFs.createFile('test.txt', 'text content')

      const pdfReq = createMockRequest({ url: '/test.pdf' })
      const jpgReq = createMockRequest({ url: '/test.jpg' })
      const txtReq = createMockRequest({ url: '/test.txt' })

      await handler(pdfReq, new MockResponse())
      await handler(jpgReq, new MockResponse())
      await handler(txtReq, new MockResponse())

      expect(mockResponse.getHeader('content-type')).toContain('text/plain')
    })

    test('should set Content-Disposition for downloads', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt?download=true',
      })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-disposition')).toBe('attachment; filename="test.txt"')
    })

    test('should set inline disposition for regular viewing', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt?download=false',
      })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-disposition')).toBe('inline; filename="test.txt"')
    })

    test('should escape quotes in filename for Content-Disposition', async () => {
      testFs.createFile('file "with quotes".txt', 'content')
      const req = createMockRequest({
        url: '/file "with quotes".txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-disposition')).toBe(
        'inline; filename="file "with quotes".txt"'
      )
    })
  })

  describe('Archive Files - Response Headers', () => {
    const { SevenZip } = require('sevenzip')
    let mockSevenZip

    beforeEach(() => {
      mockSevenZip = {
        getSingleFile: jest.fn(),
        extractFile: jest.fn(),
      }
      jest.mock('sevenzip', () => ({ SevenZip: jest.fn(() => mockSevenZip) }))
    })

    afterEach(() => {
      jest.resetModules()
    })

    test('should set correct Content-Range for archive extraction', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
        headers: { range: 'bytes=100-299' },
      })

      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 5000, size: 5000 })
      mockSevenZip.extractFile.mockResolvedValue({ pipe: jest.fn() })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-range')).toBe('bytes 100-299/5000')
      expect(mockResponse.statusCode).toBe(206)
    })

    test('should set Content-Length based on archive file size', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
        headers: { range: 'bytes=100-299' },
      })

      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 5000, size: 5000 })
      mockSevenZip.extractFile.mockResolvedValue({ pipe: jest.fn() })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-length')).toBe('200')
    })

    test('should not set Accept-Ranges for archive requests', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
      })

      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 5000 })
      mockSevenZip.extractFile.mockResolvedValue({ pipe: jest.fn() })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('accept-ranges')).toBeUndefined()
      expect(mockResponse.getHeader('content-length')).toBe('5000')
    })

    test('should detect MIME type from extracted filename', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=image.jpg',
      })

      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 5000 })
      mockSevenZip.extractFile.mockResolvedValue({ pipe: jest.fn() })

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toContain('image/jpeg')
    })
  })

  describe('Header Edge Cases', () => {
    test('should handle zero-byte files', async () => {
      testFs.createFile('empty.txt', '')
      const req = createMockRequest({
        url: '/empty.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-length')).toBe('0')
    })

    test('should handle single-byte files with range requests', async () => {
      testFs.createFile('single.txt', 'A')
      const req = createMockRequest({
        url: '/single.txt',
        headers: { range: 'bytes=0-0' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 0-0/1')
      expect(mockResponse.getHeader('content-length')).toBe('1')
    })

    test('should calculate correct Content-Length when range exceeds file size', async () => {
      testFs.createLargeFile('small.txt', 100)
      const req = createMockRequest({
        url: '/small.txt',
        headers: { range: 'bytes=50-200' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 50-200/100')
      expect(mockResponse.getHeader('content-length')).toBe('50')
    })

    test('should handle case where range start equals file size', async () => {
      testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=1000-' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 1000-999/1000')
      expect(mockResponse.getHeader('content-length')).toBe('0')
    })
  })
})
