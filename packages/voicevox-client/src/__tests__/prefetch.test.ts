import { beforeEach, describe, expect, it } from 'vitest'
import { PrefetchManager } from '../queue/prefetch-manager'

describe('PrefetchManager', () => {
  let manager: PrefetchManager

  beforeEach(() => {
    manager = new PrefetchManager(2) // prefetchSize = 2
  })

  describe('constructor', () => {
    it('should initialize with default prefetchSize of 2', () => {
      const defaultManager = new PrefetchManager()
      expect(defaultManager.getPrefetchSize()).toBe(2)
    })

    it('should initialize with custom prefetchSize', () => {
      const customManager = new PrefetchManager(5)
      expect(customManager.getPrefetchSize()).toBe(5)
    })
  })

  describe('addPendingItem', () => {
    it('should add item to pending queue', () => {
      manager.addPendingItem('item-1')
      expect(manager.getPendingCount()).toBe(1)
    })

    it('should not add duplicate items', () => {
      manager.addPendingItem('item-1')
      manager.addPendingItem('item-1')
      expect(manager.getPendingCount()).toBe(1)
    })

    it('should add multiple different items', () => {
      manager.addPendingItem('item-1')
      manager.addPendingItem('item-2')
      manager.addPendingItem('item-3')
      expect(manager.getPendingCount()).toBe(3)
    })
  })

  describe('getItemsToGenerate', () => {
    it('should return up to prefetchSize items when no items are generating', () => {
      manager.addPendingItem('item-1')
      manager.addPendingItem('item-2')
      manager.addPendingItem('item-3')

      const items = manager.getItemsToGenerate()
      expect(items).toEqual(['item-1', 'item-2'])
    })

    it('should return fewer items when some are already generating', () => {
      manager.addPendingItem('item-1')
      manager.addPendingItem('item-2')
      manager.addPendingItem('item-3')
      manager.incrementGenerating()

      const items = manager.getItemsToGenerate()
      expect(items).toEqual(['item-1'])
    })

    it('should return empty array when at prefetchSize capacity', () => {
      manager.addPendingItem('item-1')
      manager.addPendingItem('item-2')
      manager.incrementGenerating()
      manager.incrementGenerating()

      const items = manager.getItemsToGenerate()
      expect(items).toEqual([])
    })

    it('should return empty array when no pending items', () => {
      const items = manager.getItemsToGenerate()
      expect(items).toEqual([])
    })

    it('should return all pending items if less than prefetchSize', () => {
      manager.addPendingItem('item-1')

      const items = manager.getItemsToGenerate()
      expect(items).toEqual(['item-1'])
    })
  })

  describe('incrementGenerating / decrementGenerating', () => {
    it('should track generating count correctly', () => {
      expect(manager.getGeneratingCount()).toBe(0)

      manager.incrementGenerating()
      expect(manager.getGeneratingCount()).toBe(1)

      manager.incrementGenerating()
      expect(manager.getGeneratingCount()).toBe(2)

      manager.decrementGenerating()
      expect(manager.getGeneratingCount()).toBe(1)
    })

    it('should not go below zero when decrementing', () => {
      manager.decrementGenerating()
      expect(manager.getGeneratingCount()).toBe(0)
    })
  })

  describe('removeItem', () => {
    it('should remove item from pending queue', () => {
      manager.addPendingItem('item-1')
      manager.addPendingItem('item-2')

      manager.removeItem('item-1')

      expect(manager.getPendingCount()).toBe(1)
      const items = manager.getItemsToGenerate()
      expect(items).toEqual(['item-2'])
    })

    it('should do nothing when removing non-existent item', () => {
      manager.addPendingItem('item-1')
      manager.removeItem('non-existent')
      expect(manager.getPendingCount()).toBe(1)
    })
  })

  describe('clear', () => {
    it('should clear all pending items and reset generating count', () => {
      manager.addPendingItem('item-1')
      manager.addPendingItem('item-2')
      manager.incrementGenerating()

      manager.clear()

      expect(manager.getPendingCount()).toBe(0)
      expect(manager.getGeneratingCount()).toBe(0)
    })
  })

  describe('prefetch workflow', () => {
    it('should limit concurrent generations to prefetchSize', () => {
      // Add 5 items
      for (let i = 1; i <= 5; i++) {
        manager.addPendingItem(`item-${i}`)
      }
      expect(manager.getPendingCount()).toBe(5)

      // Get first batch to generate
      const batch1 = manager.getItemsToGenerate()
      expect(batch1).toEqual(['item-1', 'item-2'])

      // Simulate starting generation for batch1
      for (const itemId of batch1) {
        manager.removeItem(itemId)
        manager.incrementGenerating()
      }
      expect(manager.getPendingCount()).toBe(3)
      expect(manager.getGeneratingCount()).toBe(2)

      // At capacity - no more items should be returned
      expect(manager.getItemsToGenerate()).toEqual([])

      // Complete one generation
      manager.decrementGenerating()
      expect(manager.getGeneratingCount()).toBe(1)

      // Now we should get one more item
      const batch2 = manager.getItemsToGenerate()
      expect(batch2).toEqual(['item-3'])
    })

    it('should continue prefetching when items complete', () => {
      manager.addPendingItem('item-1')
      manager.addPendingItem('item-2')
      manager.addPendingItem('item-3')

      // Start first two
      const batch1 = manager.getItemsToGenerate()
      for (const itemId of batch1) {
        manager.removeItem(itemId)
        manager.incrementGenerating()
      }

      // Complete first
      manager.decrementGenerating()

      // Should get item-3
      const batch2 = manager.getItemsToGenerate()
      expect(batch2).toEqual(['item-3'])
    })
  })
})
