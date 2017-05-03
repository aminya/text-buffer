const {Emitter} = require('event-kit')
const Point = require('./point')
const NOOP = function () {}

module.exports =
class MarkerTextDecorationLayer {
  constructor (markerLayer, {boundariesPerQuery, classNameForMarkerId, inlineStyleForMarkerId}) {
    this.markerLayer = markerLayer
    this.markerLayer.registerMarkerTextDecorationLayer(this)
    this.emitter = new Emitter()
    this.invalidatedRanges = []
    this.boundariesPerQuery = boundariesPerQuery || 50
    this.classNameForScopeId = classNameForMarkerId || NOOP
    this.inlineStyleForScopeId = inlineStyleForMarkerId || NOOP
  }

  destroy () {
    this.markerLayer.unregisterMarkerTextDecorationLayer(this)
  }

  buildIterator () {
    return new MarkerTextDecorationLayerIterator(this)
  }

  didInvalidatedMarkersInRanges (ranges) {
    this.invalidatedRanges.push(...ranges)
  }

  clearInvalidatedRanges () {
    this.invalidatedRanges = []
  }

  getInvalidatedRanges () {
    return this.invalidatedRanges
  }

  onDidInvalidateRange (fn) {
    return this.emitter.on('did-invalidate-range', fn)
  }

  didCreateMarker (range) {
    this.emitter.emit('did-invalidate-range', range)
  }

  didMoveMarker (oldRange, newRange) {
    this.emitter.emit('did-invalidate-range', oldRange)
    this.emitter.emit('did-invalidate-range', newRange)
  }

  didDestroyMarker (range) {
    this.emitter.emit('did-invalidate-range', range)
  }
}

class MarkerTextDecorationLayerIterator {
  constructor (layer) {
    this.layer = layer
    this.openScopeIds = []
    this.closeScopeIds = []
  }

  seek (start) {
    const {containingStart, boundaries} = this.layer.markerLayer.index.findBoundariesAfter(start, this.layer.boundariesPerQuery)
    this.boundaries = boundaries
    for (let i = 0; i < containingStart.length; i++) {
      const marker = this.layer.markerLayer.getMarker(containingStart[i])
      if (!marker.isValid() || !this.hasInlineStyleOrClassName(marker.id)) {
        containingStart.splice(i, 1)
        i--
      }
    }

    this.boundaryIndex = 0
    this.computeScopeIds()
    if (this.openScopeIds.length === 0 && this.closeScopeIds.length === 0) {
      this.moveToSuccessor()
    }
    return containingStart
  }

  moveToSuccessor () {
    if (this.boundaries.length === 0) return

    do {
      // Fetch more marker boundaries if needed
      if (this.boundaryIndex === this.boundaries.length - 1) {
        const {row, column} = this.getPosition()
        const {boundaries} = this.layer.markerLayer.index.findBoundariesAfter(
          Point(row, column + 1),
          this.layer.boundariesPerQuery
        )
        this.boundaries = boundaries
        this.boundaryIndex = 0
      } else {
        this.boundaryIndex++
      }

      this.computeScopeIds()
    } while (this.openScopeIds.length === 0 && this.closeScopeIds.length === 0 && this.boundaries.length > 0)
  }

  getPosition () {
    const boundary = this.boundaries[this.boundaryIndex]
    return boundary ? Point.fromObject(boundary.position) : Point.INFINITY
  }

  getCloseScopeIds () {
    return this.closeScopeIds
  }

  getOpenScopeIds () {
    return this.openScopeIds
  }

  computeScopeIds () {
    const boundary = this.boundaries[this.boundaryIndex]
    this.openScopeIds.length = 0
    this.closeScopeIds.length = 0

    if (boundary) {
      boundary.starting.forEach((markerId) => {
        const marker = this.layer.markerLayer.getMarker(markerId)
        if (!boundary.ending.has(markerId) && marker.isValid() && this.hasInlineStyleOrClassName(markerId)) {
          this.openScopeIds.push(markerId)
        }
      })

      boundary.ending.forEach((markerId) => {
        const marker = this.layer.markerLayer.getMarker(markerId)
        if (!boundary.starting.has(markerId) && marker.isValid() && this.hasInlineStyleOrClassName(markerId)) {
          this.closeScopeIds.push(markerId)
        }
      })
    }
  }

  hasInlineStyleOrClassName (scopeId) {
    return (
      this.layer.classNameForScopeId(scopeId) ||
      this.layer.inlineStyleForScopeId(scopeId)
    )
  }
}
