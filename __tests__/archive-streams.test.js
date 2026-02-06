const { TestFileSystem, MockResponse, createMockRequest } = require('../test-utils')
const api = require('../api.js')

describe('Range Request Stream Creation (Archive Files)', () => {
  let testFs
  let mockResponse
  let handler
  let mockSevenZip

  beforeEach(() => {
    testFs = new TestFileSystem()
    mockResponse = new MockResponse()
    handler = api(testFs.getTempPath())

    mockSevenZip = {
      getSingleFile: jest.fn(),
      extractFile: jest.fn(),
    }

    jest.mock('sevenzip', () => {
      return {
        SevenZip: jest.fn(() => mockSevenZip),
      }
    })
  })

  afterEach(() => {
    testFs.cleanup()
    jest.resetModules()
    jest.clearAllMocks()
  })

  describe('Archive Extraction Stream Creation', () => {
    test('should call extractFile with correct parameters', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 5000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockSevenZip.extractFile).toHaveBeenCalledWith(archivePath, 'large-file.txt')
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse)
    })

    test('should create extraction stream without range', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=document.pdf',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 3000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockSevenZip.getSingleFile).toHaveBeenCalledWith(archivePath, 'document.pdf')
      expect(mockSevenZip.extractFile).toHaveBeenCalledWith(archivePath, 'document.pdf')
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse)
      expect(mockResponse.statusCode).toBe(200)
    })

    test('should handle range requests for archive files', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
        headers: { range: 'bytes=1000-1999' },
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 5000, size: 5000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockSevenZip.getSingleFile).toHaveBeenCalledWith(archivePath, 'large-file.txt')
      expect(mockSevenZip.extractFile).toHaveBeenCalledWith(archivePath, 'large-file.txt')
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse)
      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 1000-1999/5000')
    })

    test('should handle suffix range for archive files', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
        headers: { range: 'bytes=2000-' },
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 5000, size: 5000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-range')).toBe('bytes 2000-4999/5000')
      expect(mockResponse.statusCode).toBe(206)
    })

    test('should extract files with special characters in name', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=file%20with%20spaces.txt',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 1000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockSevenZip.extractFile).toHaveBeenCalledWith(archivePath, 'file with spaces.txt')
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse)
    })

    test('should extract files in subdirectories within archive', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=folder/nested-file.txt',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 2000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockSevenZip.extractFile).toHaveBeenCalledWith(archivePath, 'folder/nested-file.txt')
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse)
    })
  })

  describe('Archive Range Request Issues', () => {
    test('should demonstrate bug: range transformation is commented out', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
        headers: { range: 'bytes=1000-1999' },
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 5000, size: 5000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse)
      expect(mockStream.pipe).not.toHaveBeenCalledWith(
        expect.objectContaining({
          startOffset: 1000,
          endOffset: 1999,
        })
      )
    })

    test('should demonstrate bug: uses stat.size instead of estat.size', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
        headers: { range: 'bytes=1000-' },
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({
        Size: 5000,
        size: 5000,
      })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-range')).toBe('bytes 1000-4999/5000')
    })

    test('should handle range requests correctly when estat and stat sizes differ', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
        headers: { range: 'bytes=100-' },
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({
        Size: 3000,
        size: 3000,
      })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-range')).toBe('bytes 100-2999/3000')
    })
  })

  describe('Archive Extraction Error Handling', () => {
    test('should handle missing extract parameter', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('`extract` param required')
    })

    test('should handle sevenzip extraction errors', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=nonexistent.txt',
      })

      mockSevenZip.getSingleFile.mockRejectedValue(new Error('File not found in archive'))

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('File not found in archive')
    })

    test('should handle sevenzip stream creation errors', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=corrupted.txt',
      })

      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 1000 })
      mockSevenZip.extractFile.mockRejectedValue(new Error('Extraction failed'))

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('Extraction failed')
    })

    test('should handle malformed archive file', async () => {
      const archivePath = testFs.createFile('corrupted.7z', 'not a valid archive')
      const req = createMockRequest({
        url: '/corrupted.7z?action=extract&extract=some-file.txt',
      })

      mockSevenZip.getSingleFile.mockRejectedValue(new Error('Invalid archive format'))

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('Invalid archive format')
    })
  })

  describe('Archive Stream Behavior', () => {
    test('should set proper MIME type based on extracted file extension', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=image.jpg',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 2000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toContain('image/jpeg')
    })

    test('should set proper MIME type for text files from archive', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=document.txt',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 1500 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toContain('text/plain')
    })

    test('should set Last-Modified based on archive file stats', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const archiveStats = testFs.getFileStats('archive.7z')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=some-file.txt',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 1000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('last-modified')).toBe(
        new Date(archiveStats.mtimeMs).toUTCString()
      )
    })

    test('should handle extracted file with no extension', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=no-extension-file',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 800 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toBeTruthy()
    })
  })

  describe('Range Request Edge Cases for Archives', () => {
    test('should handle range beyond extracted file size', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=small.txt',
        headers: { range: 'bytes=2000-3000' },
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 1000, size: 1000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 2000-3000/1000')
      expect(mockResponse.getHeader('content-length')).toBe('0')
    })

    test('should handle range start at extracted file size', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=medium.txt',
        headers: { range: 'bytes=1000-' },
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 1000, size: 1000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 1000-999/1000')
      expect(mockResponse.getHeader('content-length')).toBe('0')
    })
  })
})
