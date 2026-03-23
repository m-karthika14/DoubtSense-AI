import { motion } from 'framer-motion';
import { AutoHelpPopup } from '../components/AutoHelpPopup';
import { Upload, FileText } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Document, Page, pdfjs } from 'react-pdf';
import { renderAsync } from 'docx-preview';
import { FaceTrackingPopup } from '../components/FaceTrackingPopup';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export function StudyView() {
  const [showHelp, setShowHelp] = useState(false);
  const [hasDocument, setHasDocument] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedTitle, setUploadedTitle] = useState<string | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);
  const [contentDoc, setContentDoc] = useState<any | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const docxContainerRef = useRef<HTMLDivElement | null>(null);
  const pdfScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const docxScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const lastSentContextRef = useRef<{ sectionId: string; topic: string } | null>(null);
  const pdfDocProxyRef = useRef<any | null>(null);
  const pdfDocLoadingRef = useRef<Promise<any> | null>(null);
  const pdfPageTopicCacheRef = useRef<Map<number, string>>(new Map());

  const { setCurrentTopic, currentTopic, agentActive, cameraActive, user, guest } = useApp();

  const API = useMemo(() => {
    return (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';
  }, []);

  const fetchContentById = async (id: string) => {
    try {
      const creq = await fetch(`${API}/api/content/${encodeURIComponent(id)}`);
      if (!creq.ok) return null;
      const cdata = await creq.json().catch(() => null);
      return cdata || null;
    } catch {
      return null;
    }
  };

  const absoluteFileUrl = useMemo(() => {
    const relative = fileUrl || contentDoc?.content?.fileUrl;
    if (!relative || typeof relative !== 'string') return null;
    if (/^https?:\/\//i.test(relative)) return relative;
    const base = API.endsWith('/') ? API.slice(0, -1) : API;
    const rel = relative.startsWith('/') ? relative : `/${relative}`;
    return `${base}${rel}`;
  }, [API, contentDoc, fileUrl]);

  const fileType = useMemo(() => {
    const rel = (fileUrl || contentDoc?.content?.fileUrl || '').toLowerCase();
    if (rel.endsWith('.pdf')) return 'pdf';
    if (rel.endsWith('.docx') || rel.endsWith('.doc')) return 'docx';
    if (rel.endsWith('.pptx')) return 'pptx';
    return 'unknown';
  }, [contentDoc, fileUrl]);

  useEffect(() => {
    if (agentActive && hasDocument) {
      const timer = setTimeout(() => {
        setShowHelp(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [setCurrentTopic, agentActive, hasDocument]);

  // Hydrate current context (if any) when user becomes available
  useEffect(() => {
    const userId = user?.userId;
    if (!userId) return;

    (async () => {
      try {
        const res = await fetch(`${API}/api/context?userId=${encodeURIComponent(userId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const topic = data?.context?.activeTopic;
        const contentIdFromContext = data?.context?.contentId;
          if (contentIdFromContext) {
            const cdata = await fetchContentById(String(contentIdFromContext));
            if (cdata) {
              setContentDoc(cdata);
              setContentId(String(contentIdFromContext));
              setHasDocument(true);
            const fileUrlFromContent = cdata?.content?.fileUrl;
            if (typeof fileUrlFromContent === 'string' && fileUrlFromContent) {
              setFileUrl(fileUrlFromContent);
            }
              const titleFromContext = data?.context?.metadata?.title;
              if (typeof titleFromContext === 'string') setUploadedTitle(titleFromContext);
            }
          }
        if (typeof topic === 'string' && topic.trim()) {
          setCurrentTopic(topic);
        }
      } catch {
        // ignore hydration errors
      }
    })();
  }, [API, setCurrentTopic, user?.userId]);

  const ensureUserId = useCallback(async () => {
    if (user?.userId) return user.userId;
    await guest();
    try {
      const raw = localStorage.getItem('doubtsense_user');
      const parsed = raw ? (JSON.parse(raw) as { userId?: string }) : null;
      return parsed?.userId;
    } catch {
      return undefined;
    }
  }, [guest, user?.userId]);

  const detectTopicClient = useCallback((rawText: string) => {
    const text = String(rawText || '').toLowerCase();
    if (text.includes('binary tree')) return 'Binary Trees';
    if (text.includes('graph')) return 'Graphs';
    if (text.includes('array')) return 'Arrays';
    return 'General';
  }, []);

  useEffect(() => {
    // Reset per-document caches when the file changes
    pdfDocProxyRef.current = null;
    pdfDocLoadingRef.current = null;
    pdfPageTopicCacheRef.current.clear();
    lastSentContextRef.current = null;
  }, [absoluteFileUrl]);

  const getPdfDocProxy = useCallback(async () => {
    if (!absoluteFileUrl) return null;
    if (pdfDocProxyRef.current) return pdfDocProxyRef.current;
    if (pdfDocLoadingRef.current) return pdfDocLoadingRef.current;

    const loading = pdfjs.getDocument(absoluteFileUrl).promise;
    pdfDocLoadingRef.current = loading;
    try {
      const doc = await loading;
      pdfDocProxyRef.current = doc;
      return doc;
    } catch {
      pdfDocLoadingRef.current = null;
      return null;
    }
  }, [absoluteFileUrl]);

  const getPdfPageTopic = useCallback(async (pageNumber: number) => {
    const cached = pdfPageTopicCacheRef.current.get(pageNumber);
    if (cached) return cached;

    const doc = await getPdfDocProxy();
    if (!doc) return 'General';
    try {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const joined = Array.isArray(textContent?.items)
        ? textContent.items
            .map((it: any) => (it && typeof it.str === 'string' ? it.str : ''))
            .filter(Boolean)
            .join(' ')
        : '';

      const topic = detectTopicClient(joined);
      pdfPageTopicCacheRef.current.set(pageNumber, topic);
      return topic;
    } catch {
      return 'General';
    }
  }, [detectTopicClient, getPdfDocProxy]);

  const postInternalContext = useCallback(
    async ({ topic, sectionId }: { topic: string; sectionId: string }) => {
      if (!agentActive) return;

      const normalizedTopic = String(topic || '').trim() || 'General';
      const normalizedSectionId = String(sectionId || '').trim();
      if (!normalizedSectionId) return;

      const last = lastSentContextRef.current;
      if (last && last.sectionId === normalizedSectionId && last.topic === normalizedTopic) return;

      const userId = await ensureUserId();
      if (!userId) return;

      try {
        await fetch(`${API}/api/context`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            agentActive: true,
            topic: normalizedTopic,
            sectionId: normalizedSectionId,
            contentId: contentId || undefined,
            metadata: { title: uploadedTitle || undefined },
          }),
        });
      } catch {
        // ignore network errors; still update UI for responsiveness
      }

      lastSentContextRef.current = { sectionId: normalizedSectionId, topic: normalizedTopic };
      setCurrentTopic(normalizedTopic);
    },
    [API, agentActive, contentId, ensureUserId, setCurrentTopic, uploadedTitle]
  );

  const findMostVisibleDataPage = useCallback((container: HTMLDivElement) => {
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-page-number]'));
    if (nodes.length === 0) return null;
    const containerRect = container.getBoundingClientRect();

    let bestPage: number | null = null;
    let bestVisible = -1;

    for (const el of nodes) {
      const pageStr = el.dataset.pageNumber;
      const pageNum = pageStr ? Number(pageStr) : NaN;
      if (!Number.isFinite(pageNum)) continue;

      const r = el.getBoundingClientRect();
      const visible = Math.max(0, Math.min(r.bottom, containerRect.bottom) - Math.max(r.top, containerRect.top));
      if (visible > bestVisible) {
        bestVisible = visible;
        bestPage = pageNum;
      }
    }

    return bestPage;
  }, []);

  const findMostVisibleHeading = useCallback((container: HTMLDivElement) => {
    const headings = Array.from(container.querySelectorAll<HTMLElement>('h1,h2,h3'));
    if (headings.length === 0) return null;
    const containerRect = container.getBoundingClientRect();

    let best: { idx: number; text: string; visible: number } | null = null;
    for (let i = 0; i < headings.length; i += 1) {
      const el = headings[i];
      const r = el.getBoundingClientRect();
      const visible = Math.max(0, Math.min(r.bottom, containerRect.bottom) - Math.max(r.top, containerRect.top));
      if (visible <= 0) continue;
      const text = String(el.textContent || '').trim();
      if (!text) continue;
      if (!best || visible > best.visible) {
        best = { idx: i, text, visible };
      }
    }
    return best;
  }, []);

  const handleReadingPause = useCallback(async () => {
    if (!agentActive) return;
    if (!absoluteFileUrl) return;

    if (fileType === 'pdf') {
      const container = pdfScrollContainerRef.current;
      if (!container) return;
      const pageNumber = findMostVisibleDataPage(container);
      if (!pageNumber) return;
      const topic = await getPdfPageTopic(pageNumber);
      await postInternalContext({ topic, sectionId: `p${pageNumber}` });
      return;
    }

    if (fileType === 'docx') {
      const container = docxScrollContainerRef.current;
      if (!container) return;

      const bestHeading = findMostVisibleHeading(container);
      if (bestHeading) {
        const topic = bestHeading.text;
        await postInternalContext({ topic, sectionId: `s${bestHeading.idx + 1}` });
        return;
      }

      // Fallback: infer topic from current rendered text
      const raw = String(container.innerText || '').slice(0, 4000);
      const topic = detectTopicClient(raw);
      await postInternalContext({ topic, sectionId: 'docx' });
    }
  }, [
    absoluteFileUrl,
    agentActive,
    detectTopicClient,
    fileType,
    findMostVisibleDataPage,
    findMostVisibleHeading,
    getPdfPageTopic,
    postInternalContext,
  ]);

  useEffect(() => {
    if (!agentActive) return;
    if (!absoluteFileUrl) return;

    const container = fileType === 'pdf'
      ? pdfScrollContainerRef.current
      : fileType === 'docx'
        ? docxScrollContainerRef.current
        : null;

    if (!container) return;

    const schedule = () => {
      if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = window.setTimeout(() => {
        void handleReadingPause();
      }, 3000);
    };

    const onScroll = () => schedule();

    container.addEventListener('scroll', onScroll, { passive: true });
    // Also schedule once on mount (user may start reading without scrolling)
    schedule();

    return () => {
      container.removeEventListener('scroll', onScroll);
      if (pauseTimerRef.current !== null) {
        window.clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
    };
  }, [agentActive, absoluteFileUrl, fileType, handleReadingPause]);

  const openFilePicker = async () => {
    setUploadError(null);
    try {
      if (!agentActive) {
        setUploadError('Agent is OFF. Turn Agent ON to upload and track learning context.');
        return;
      }

      const userId = await ensureUserId();
      if (!userId) {
        setUploadError('Unable to create a guest session. Please try again.');
        return;
      }
      fileInputRef.current?.click();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to start upload');
    }
  };

  const uploadFile = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      if (!agentActive) {
        setUploadError('Agent is OFF. Turn Agent ON to upload and track learning context.');
        return;
      }

      const userId = await ensureUserId();
      if (!userId) throw new Error('userId not available');

      const form = new FormData();
      form.append('userId', userId);
      form.append('agentActive', 'true');
      form.append('file', file);

      const res = await fetch(`${API}/api/upload`, {
        method: 'POST',
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || 'Upload failed');
      }

      const topic = data?.context?.activeTopic;
      const title = data?.context?.metadata?.title;
      const cid = data?.contentId;
      const fUrl = data?.fileUrl;

      if (typeof topic === 'string') setCurrentTopic(topic);
      if (typeof title === 'string') setUploadedTitle(title);
      if (typeof fUrl === 'string' && fUrl) setFileUrl(fUrl);
      if (typeof cid === 'string' || typeof cid === 'object') {
        const idStr = String(cid);
        setContentId(idStr);
        let cdoc = await fetchContentById(idStr);
        // fallback: re-check context for authoritative contentId then fetch
        if (!cdoc) {
          try {
            const ctxRes = await fetch(`${API}/api/context?userId=${encodeURIComponent(userId)}`);
            if (ctxRes.ok) {
              const ctx = await ctxRes.json().catch(() => null);
              const ctxId = ctx?.context?.contentId;
              if (ctxId && String(ctxId) !== idStr) {
                cdoc = await fetchContentById(String(ctxId));
                if (cdoc) setContentId(String(ctxId));
              }
            }
          } catch {
            // ignore
          }
        }

        setContentDoc(cdoc);
        if (!cdoc) setUploadError('Uploaded but failed to load document content. Try refreshing or check the backend.');
      }

      setHasDocument(true);
    } finally {
      setUploading(false);
    }
  };

  const isSupportedFile = (f: File) => {
    const name = f.name.toLowerCase();
    if (name.endsWith('.pdf')) return true;
    if (name.endsWith('.docx') || name.endsWith('.doc')) return true;
    if (name.endsWith('.pptx')) return true;

    const type = (f.type || '').toLowerCase();
    if (type.includes('pdf')) return true;
    if (type.includes('wordprocessingml') || type.includes('msword')) return true;
    if (type.includes('presentationml') || type.includes('powerpoint')) return true;
    return false;
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isSupportedFile(file)) {
      setUploadError('Please select a PDF (.pdf), Word (.docx/.doc), or PowerPoint (.pptx) file.');
      e.target.value = '';
      return;
    }
    await uploadFile(file);
    e.target.value = '';
  };

  useEffect(() => {
    if (fileType !== 'docx') return;
    if (!absoluteFileUrl) return;
    if (!docxContainerRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(absoluteFileUrl);
        if (!res.ok) throw new Error('Unable to fetch DOCX');
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        docxContainerRef.current!.innerHTML = '';
        await renderAsync(buffer, docxContainerRef.current!, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
        });
      } catch {
        // Show fallback below
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [absoluteFileUrl, fileType]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gradient-to-br dark:from-slate-900 dark:to-indigo-950">
      <div className="pt-32 px-4 max-w-5xl mx-auto pb-20">
        {!hasDocument ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center min-h-[60vh]"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={onFileChange}
              disabled={uploading}
            />
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={openFilePicker}
              className={`glassmorphic rounded-3xl p-12 text-center transition-all ${
                agentActive
                  ? 'cursor-pointer hover:shadow-2xl'
                  : 'opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center mx-auto mb-6">
                <Upload className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {uploading ? 'Uploading…' : 'Upload Your Study Material'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Upload a PDF, Word, or PPT to begin studying
              </p>
              {!agentActive && !uploadError && (
                <div className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                  Turn ON Agent to enable AI tracking
                </div>
              )}
              {uploadError && (
                <div className="text-sm text-red-600 dark:text-red-400 mb-4">
                  {uploadError}
                </div>
              )}
              <div className="text-sm text-gray-500 dark:text-gray-500">
                Supports PDF (.pdf), Word (.docx/.doc), PowerPoint (.pptx)
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="glassmorphic rounded-3xl p-12"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-3 mb-8 pb-6 border-b border-gray-200 dark:border-gray-700"
            >
              <FileText className="w-6 h-6 text-violet-600" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {uploadedTitle || 'Uploaded Document'}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <span>Active topic:</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-200">
                    {currentTopic || 'General'}
                  </span>
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="prose dark:prose-invert max-w-none"
            >
              {absoluteFileUrl ? (
                <div className="mb-8">
                  <div className="mb-3">
                    <a
                      href={absoluteFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-violet-700 dark:text-violet-300"
                    >
                      Open original file
                    </a>
                  </div>
                  {fileType === 'pdf' && (
                    <div className="bg-white dark:bg-white/5 rounded-xl p-4">
                      <div className="flex items-center justify-end gap-2 mb-3">
                        <div className="mr-auto flex items-center gap-2">
                          <div className="text-sm text-gray-600 dark:text-gray-400">Topic:</div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-200">
                            {currentTopic || 'General'}
                          </span>
                          <span className="text-sm text-gray-600 dark:text-gray-400 ml-3">Zoom:</span>
                        </div>
                        <button
                          onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}
                          className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-gray-800 dark:text-gray-200"
                          aria-label="Zoom out"
                        >
                          −
                        </button>
                        <div className="text-sm w-16 text-center text-gray-700 dark:text-gray-300">{Math.round(zoom * 100)}%</div>
                        <button
                          onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                          className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-gray-800 dark:text-gray-200"
                          aria-label="Zoom in"
                        >
                          +
                        </button>
                      </div>
                      <Document
                        file={absoluteFileUrl}
                        onLoadSuccess={(info) => setNumPages(info.numPages)}
                        loading={<p className="text-gray-700 dark:text-gray-300">Loading PDF…</p>}
                        error={<p className="text-gray-700 dark:text-gray-300">Unable to preview PDF.</p>}
                      >
                        <div ref={pdfScrollContainerRef} className="space-y-4 max-h-[70vh] overflow-auto">
                          {Array.from(new Array(numPages || 0), (_el, index) => {
                            const pageNumber = index + 1;
                            return (
                              <div key={`pagewrap_${pageNumber}`} data-page-number={pageNumber}>
                                <Page
                                  key={`page_${pageNumber}`}
                                  pageNumber={pageNumber}
                                  renderTextLayer={false}
                                  renderAnnotationLayer={false}
                                  scale={zoom}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </Document>
                    </div>
                  )}

                  {fileType === 'docx' && (
                    <div ref={docxScrollContainerRef} className="bg-white dark:bg-white/5 rounded-xl p-4 max-h-[70vh] overflow-auto">
                      <div className="sticky top-0 z-10 -mx-4 -mt-4 px-4 pt-4 pb-2 bg-white dark:bg-slate-950/80">
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-gray-600 dark:text-gray-400">Topic:</div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-200">
                            {currentTopic || 'General'}
                          </span>
                        </div>
                      </div>
                      <div ref={docxContainerRef} />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        If preview looks off, download and open locally.
                      </p>
                    </div>
                  )}

                  {fileType === 'pptx' && (
                    <div className="bg-white dark:bg-white/5 rounded-xl p-4">
                      <p className="text-gray-700 dark:text-gray-300">
                        Preview not supported yet for PowerPoint (.pptx).
                      </p>
                    </div>
                  )}

                  {fileType === 'unknown' && (
                    <div className="bg-white dark:bg-white/5 rounded-xl p-4">
                      <p className="text-gray-700 dark:text-gray-300">Preview not available.</p>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Document content excerpt removed: only file preview is shown. */}
            </motion.div>
          </motion.div>
        )}
      </div>

      <FaceTrackingPopup enabled={agentActive && cameraActive} />

      <AutoHelpPopup
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        message="I noticed you've been on this integration problem for a while. The key is to choose u = x because it simplifies when differentiated. Would you like me to walk through the steps?"
        onShowMore={() => {
          setShowHelp(false);
        }}
      />
    </div>
  );
}
