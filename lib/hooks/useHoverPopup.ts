'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export function useHoverPopup(enterDelay = 200, leaveDelay = 100, fadeDuration = 150) {
  const [showPopup, setShowPopup] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const hoverEnterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hoverEnterTimer.current) clearTimeout(hoverEnterTimer.current)
      if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current)
      if (fadeOutTimer.current) clearTimeout(fadeOutTimer.current)
    }
  }, [])

  const startFadeOut = useCallback(() => {
    setFadingOut(true)
    fadeOutTimer.current = setTimeout(() => {
      setShowPopup(false)
      setFadingOut(false)
    }, fadeDuration)
  }, [fadeDuration])

  const cancelFadeOut = useCallback(() => {
    if (fadeOutTimer.current) {
      clearTimeout(fadeOutTimer.current)
      fadeOutTimer.current = null
    }
    setFadingOut(false)
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (hoverLeaveTimer.current) {
      clearTimeout(hoverLeaveTimer.current)
      hoverLeaveTimer.current = null
    }
    cancelFadeOut()
    if (!showPopup) {
      hoverEnterTimer.current = setTimeout(() => setShowPopup(true), enterDelay)
    }
  }, [showPopup, cancelFadeOut, enterDelay])

  const handleMouseLeave = useCallback(() => {
    if (hoverEnterTimer.current) {
      clearTimeout(hoverEnterTimer.current)
      hoverEnterTimer.current = null
    }
    hoverLeaveTimer.current = setTimeout(startFadeOut, leaveDelay)
  }, [startFadeOut, leaveDelay])

  const handlePopupMouseEnter = useCallback(() => {
    if (hoverLeaveTimer.current) {
      clearTimeout(hoverLeaveTimer.current)
      hoverLeaveTimer.current = null
    }
    cancelFadeOut()
  }, [cancelFadeOut])

  const handlePopupMouseLeave = useCallback(() => {
    startFadeOut()
  }, [startFadeOut])

  return {
    showPopup,
    fadingOut,
    handleMouseEnter,
    handleMouseLeave,
    handlePopupMouseEnter,
    handlePopupMouseLeave,
  }
}
