import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

function MobilePdfPage({ pdf, pageNumber, width, root }) {
  const pageRef = useRef(null)
  const canvasRef = useRef(null)
  const [active, setActive] = useState(pageNumber === 1)
  const [height, setHeight] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = pageRef.current
    if (!element || !root) return undefined
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) setActive(true)
    }, { root, rootMargin: '700px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [root])

  useEffect(() => {
    if (!active || !width || !pdf || !canvasRef.current) return undefined
    let cancelled = false
    const render = async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled) return
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min((width - 24) / baseViewport.width, 1.35)
        const viewport = page.getViewport({ scale })
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
        const canvas = canvasRef.current
        const context = canvas.getContext('2d', { alpha: false })
        canvas.width = Math.ceil(viewport.width * ratio)
        canvas.height = Math.ceil(viewport.height * ratio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        setHeight(viewport.height + 16)
        await page.render({ canvasContext: context, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null }).promise
      } catch (renderError) {
        if (!cancelled) setError(renderError.message || 'Không thể hiển thị trang PDF.')
      }
    }
    render()
    return () => { cancelled = true }
  }, [active, pageNumber, pdf, width])

  return <div ref={pageRef} className="mobile-pdf-page" style={{ minHeight: `${height || Math.max(220, width * 1.414)}px` }}>
    {error ? <div className="viewer-message"><b>Không thể hiển thị trang {pageNumber}</b><span>{error}</span></div> : <canvas ref={canvasRef} aria-label={`Trang ${pageNumber}`} />}
  </div>
}

export default function MobilePdfViewer({ url, onError }) {
  const scrollRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [width, setWidth] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let loadingTask
    let cancelled = false
    setPdf(null)
    setPageCount(0)
    setError('')
    loadingTask = pdfjsLib.getDocument({ url })
    loadingTask.promise.then(document => {
      if (cancelled) return document.destroy()
      setPdf(document)
      setPageCount(document.numPages)
    }).catch(loadError => {
      if (!cancelled) {
        const message = loadError.message || 'Không thể mở file PDF.'
        setError(message)
        onError?.(message)
      }
    })
    return () => {
      cancelled = true
      loadingTask?.destroy()
    }
  }, [onError, url])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return undefined
    const updateWidth = () => setWidth(element.clientWidth)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [pdf])

  return <div ref={scrollRef} className="mobile-pdf-scroll">
    {error && <div className="viewer-message"><b>Không thể mở PDF</b><span>{error}</span></div>}
    {!error && !pdf && <div className="viewer-message"><span>Đang tải PDF...</span></div>}
    {pdf && Array.from({ length: pageCount }, (_, index) => <MobilePdfPage key={index + 1} pdf={pdf} pageNumber={index + 1} width={width} root={scrollRef.current} />)}
  </div>
}
