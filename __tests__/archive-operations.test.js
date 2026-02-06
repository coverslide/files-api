const { TestFileSystem, MockResponse, createMockRequest } = require('../test-utils')
const api = require('../api.js')

describe('Archive Extraction and Contents Listing', () => {
  let testFs
  let mockResponse
  let handler
  let mockSevenZip

  beforeEach(() => {
    testFs = new TestFileSystem()
    mockResponse = new MockResponse()
    handler = api(testFs.getTempPath())

    mockSevenZip = {
      getFiles: jest.fn(),
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

  describe('Archive Contents Listing (action=contents)', () => {
    test('should list archive contents successfully', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const mockArchiveFiles = [
        {
          Path: 'document.txt',
          Size: 1024,
          'Packed Size': 512,
          Folder: '',
          Modified: '2023-01-01T12:00:00',
        },
        {
          Path: 'images/photo.jpg',
          Size: 2048,
          'Packed Size': 1024,
          Folder: '',
          Modified: '2023-01-02T15:30:00',
        },
        {
          Path: 'folder/',
          Size: 0,
          'Packed Size': 0,
          Folder: '+',
          Modified: '2023-01-03T09:15:00',
        },
      ]

      mockSevenZip.getFiles.mockResolvedValue(mockArchiveFiles)
      const req = createMockRequest({
        url: '/archive.7z?action=contents',
      })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.filename).toBe('archive.7z')
      expect(response.directory).toBe(false)
      expect(response.files).toHaveLength(3)

      const textFile = response.files.find((f) => f.filename === 'document.txt')
      const imageFile = response.files.find((f) => f.filename === 'images/photo.jpg')
      const folder = response.files.find((f) => f.filename === 'folder/')

      expect(textFile.usize).toBe(1024)
      expect(textFile.csize).toBe(512)
      expect(textFile.directory).toBe(false)

      expect(imageFile.usize).toBe(2048)
      expect(imageFile.csize).toBe(1024)
      expect(imageFile.directory).toBe(false)

      expect(folder.usize).toBe(0)
      expect(folder.csize).toBe(0)
      expect(folder.directory).toBe(true)

      expect(mockSevenZip.getFiles).toHaveBeenCalledWith(archivePath)
    })

    test('should handle empty archive', async () => {
      const archivePath = testFs.createFile('empty.7z', 'empty archive data')
      mockSevenZip.getFiles.mockResolvedValue([])
      const req = createMockRequest({
        url: '/empty.7z?action=contents',
      })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.filename).toBe('empty.7z')
      expect(response.directory).toBe(false)
      expect(response.files).toEqual([])
    })

    test('should handle archive with only directories', async () => {
      const archivePath = testFs.createFile('dirs-only.7z', 'dirs only archive')
      const mockArchiveFiles = [
        {
          Path: 'folder1/',
          Size: 0,
          'Packed Size': 0,
          Folder: '+',
          Modified: '2023-01-01T12:00:00',
        },
        {
          Path: 'folder2/subfolder/',
          Size: 0,
          'Packed Size': 0,
          Folder: '+',
          Modified: '2023-01-02T12:00:00',
        },
      ]

      mockSevenZip.getFiles.mockResolvedValue(mockArchiveFiles)
      const req = createMockRequest({
        url: '/dirs-only.7z?action=contents',
      })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.files).toHaveLength(2)
      expect(response.files.every((f) => f.directory)).toBe(true)
    })

    test('should parse archive file timestamps correctly', async () => {
      const archivePath = testFs.createFile('archive.7z', 'archive data')
      const mockArchiveFiles = [
        {
          Path: 'test.txt',
          Size: 100,
          'Packed Size': 50,
          Folder: '',
          Modified: '2023-06-15T14:30:45',
        },
      ]

      mockSevenZip.getFiles.mockResolvedValue(mockArchiveFiles)
      const req = createMockRequest({
        url: '/archive.7z?action=contents',
      })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      const file = response.files[0]

      expect(file.mtime).toBeInstanceOf(Date)
      expect(file.mtimeMs).toBe(file.mtime.getTime())
      expect(file.mtime.getFullYear()).toBe(2023)
      expect(file.mtime.getMonth()).toBe(5)
      expect(file.mtime.getDate()).toBe(15)
    })
  })

  describe('Archive File Extraction (action=extract)', () => {
    test('should extract file from archive successfully', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=document.txt',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 1024 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockSevenZip.getSingleFile).toHaveBeenCalledWith(archivePath, 'document.txt')
      expect(mockSevenZip.extractFile).toHaveBeenCalledWith(archivePath, 'document.txt')
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse)
      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-length')).toBe('1024')
    })

    test('should handle file extraction with range request', async () => {
      const archivePath = testFs.createFile('archive.7z', 'archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large.txt',
        headers: { range: 'bytes=500-999' },
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 2000, size: 2000 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 500-999/2000')
      expect(mockResponse.getHeader('content-length')).toBe('500')
    })

    test('should extract file with spaces in name', async () => {
      const archivePath = testFs.createFile('archive.7z', 'archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=file%20with%20spaces.txt',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 500 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockSevenZip.getSingleFile).toHaveBeenCalledWith(archivePath, 'file with spaces.txt')
      expect(mockSevenZip.extractFile).toHaveBeenCalledWith(archivePath, 'file with spaces.txt')
    })

    test('should extract file from nested directory in archive', async () => {
      const archivePath = testFs.createFile('archive.7z', 'archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=folder/subfolder/nested.txt',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 750 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockSevenZip.getSingleFile).toHaveBeenCalledWith(
        archivePath,
        'folder/subfolder/nested.txt'
      )
      expect(mockSevenZip.extractFile).toHaveBeenCalledWith(
        archivePath,
        'folder/subfolder/nested.txt'
      )
    })

    test('should set MIME type based on extracted file extension', async () => {
      const archivePath = testFs.createFile('archive.7z', 'archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=image.png',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 2048 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-type')).toContain('image/png')
    })

    test('should set Content-Disposition for extracted files', async () => {
      const archivePath = testFs.createFile('archive.7z', 'archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=document.pdf',
      })

      const mockStream = { pipe: jest.fn() }
      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 1024 })
      mockSevenZip.extractFile.mockResolvedValue(mockStream)

      await handler(req, mockResponse)

      expect(mockResponse.getHeader('content-disposition')).toBe('inline; filename="document.pdf"')
    })
  })

  describe('Archive Error Handling', () => {
    test('should handle missing extract parameter', async () => {
      const archivePath = testFs.createFile('archive.7z', 'archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('`extract` param required')
      expect(mockSevenZip.getSingleFile).not.toHaveBeenCalled()
      expect(mockSevenZip.extractFile).not.toHaveBeenCalled()
    })

    test('should handle non-existent file in archive', async () => {
      const archivePath = testFs.createFile('archive.7z', 'archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=nonexistent.txt',
      })

      mockSevenZip.getSingleFile.mockRejectedValue(new Error('File not found in archive'))

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('File not found in archive')
    })

    test('should handle corrupted archive during contents listing', async () => {
      const archivePath = testFs.createFile('corrupted.7z', 'invalid archive data')
      const req = createMockRequest({
        url: '/corrupted.7z?action=contents',
      })

      mockSevenZip.getFiles.mockRejectedValue(new Error('Invalid archive format'))

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('Invalid archive format')
    })

    test('should handle extraction failure', async () => {
      const archivePath = testFs.createFile('archive.7z', 'archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=corrupted.txt',
      })

      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 1024 })
      mockSevenZip.extractFile.mockRejectedValue(new Error('Extraction failed'))

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('Extraction failed')
    })

    test('should handle non-archive file with contents action', async () => {
      const textPath = testFs.createFile('text.txt', 'not an archive')
      const req = createMockRequest({
        url: '/text.txt?action=contents',
      })

      mockSevenZip.getFiles.mockRejectedValue(new Error('Not an archive'))

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('Not an archive')
    })
  })

  describe('Archive Format Support', () => {
    test('should handle different archive formats', async () => {
      const formats = ['archive.zip', 'archive.rar', 'archive.tar', 'archive.7z']

      for (const format of formats) {
        const archivePath = testFs.createFile(format, 'archive data')
        const req = createMockRequest({
          url: `/${format}?action=contents`,
        })

        mockSevenZip.getFiles.mockResolvedValue([])

        await handler(req, mockResponse)

        expect(mockResponse.statusCode).toBe(200)
        expect(mockSevenZip.getFiles).toHaveBeenCalledWith(archivePath)
      }
    })

    test('should handle archives with various file types', async () => {
      const archivePath = testFs.createFile('mixed.7z', 'mixed archive')
      const mockArchiveFiles = [
        {
          Path: 'documents/readme.txt',
          Size: 100,
          'Packed Size': 50,
          Folder: '',
          Modified: '2023-01-01T12:00:00',
        },
        {
          Path: 'images/logo.png',
          Size: 2048,
          'Packed Size': 1024,
          Folder: '',
          Modified: '2023-01-02T12:00:00',
        },
        {
          Path: 'data/config.json',
          Size: 256,
          'Packed Size': 128,
          Folder: '',
          Modified: '2023-01-03T12:00:00',
        },
      ]

      mockSevenZip.getFiles.mockResolvedValue(mockArchiveFiles)
      const req = createMockRequest({
        url: '/mixed.7z?action=contents',
      })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.files).toHaveLength(3)

      const txtFile = response.files.find((f) => f.filename === 'documents/readme.txt')
      const pngFile = response.files.find((f) => f.filename === 'images/logo.png')
      const jsonFile = response.files.find((f) => f.filename === 'data/config.json')

      expect(txtFile).toBeDefined()
      expect(pngFile).toBeDefined()
      expect(jsonFile).toBeDefined()
    })
  })

  describe('Archive Metadata Parsing', () => {
    test('should parse all SevenZip output fields correctly', async () => {
      const archivePath = testFs.createFile('detailed.7z', 'detailed archive')
      const mockArchiveFiles = [
        {
          Path: 'complex-filename_v2.0.txt',
          Size: 4096,
          'Packed Size': 2048,
          Folder: '',
          Modified: '2023-12-31T23:59:59',
          Created: '2023-01-01T00:00:00',
          Accessed: '2023-06-15T12:00:00',
        },
      ]

      mockSevenZip.getFiles.mockResolvedValue(mockArchiveFiles)
      const req = createMockRequest({
        url: '/detailed.7z?action=contents',
      })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      const file = response.files[0]

      expect(file.filename).toBe('complex-filename_v2.0.txt')
      expect(file.usize).toBe(4096)
      expect(file.csize).toBe(2048)
      expect(file.directory).toBe(false)
      expect(file.mtime).toBeInstanceOf(Date)
      expect(file.mtimeMs).toBe(file.mtime.getTime())
    })

    test('should handle files with Unicode names in archives', async () => {
      const archivePath = testFs.createFile('unicode.7z', 'unicode archive')
      const mockArchiveFiles = [
        {
          Path: 'документ.txt',
          Size: 100,
          'Packed Size': 50,
          Folder: '',
          Modified: '2023-01-01T12:00:00',
        },
      ]

      mockSevenZip.getFiles.mockResolvedValue(mockArchiveFiles)
      const req = createMockRequest({
        url: '/unicode.7z?action=contents',
      })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.files[0].filename).toBe('документ.txt')
    })
  })
})
