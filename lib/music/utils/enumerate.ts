import { globalConfig } from '@/lib/config'
import fs from 'fs/promises'
import fss from 'fs'
import path from 'path'

// Async version with parallel directory traversal
export async function enumerateMusicFiles(
  extensions: string[] = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg']
): Promise<string[]> {
  const musicDirectory = globalConfig.music_directory
    .replace(/\/?$/, '/') // Ensure trailing slash
    .replace("~", process.env.HOME || '') // Expand ~ to home directory

  const extSet = new Set(extensions.map(ext => ext.toLowerCase())) // O(1) lookups

  async function walkDir(dir: string): Promise<string[]> {
    try {
      // withFileTypes avoids separate stat calls
      const entries = await fs.readdir(dir, { withFileTypes: true })

      // Process directories and files in parallel
      const promises = entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          return walkDir(fullPath) // Recursive call
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          return extSet.has(ext) ? [fullPath] : []
        }
        return []
      })

      const results = await Promise.all(promises)
      return results.flat()
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error)
      return []
    }
  }

  try {
    return await walkDir(musicDirectory)
  } catch (error) {
    console.error("Error enumerating music files:", error)
    return []
  }
}

// Generator version for streaming - ideal for huge libraries
export async function* enumerateMusicFilesStream(
  extensions: string[] = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg']
): AsyncGenerator<string, void, undefined> {
  const musicDirectory = globalConfig.music_directory
    .replace(/\/?$/, '/')
    .replace("~", process.env.HOME || '')

  const extSet = new Set(extensions.map(ext => ext.toLowerCase()))

  async function* walkDir(dir: string): AsyncGenerator<string, void, undefined> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          yield* walkDir(fullPath) // Recursively yield from subdirectories
        } else if (entry.isFile() && extSet.has(path.extname(entry.name).toLowerCase())) {
          yield fullPath
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error)
    }
  }

  yield* walkDir(musicDirectory)
}
