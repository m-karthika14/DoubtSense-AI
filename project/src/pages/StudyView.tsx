import { motion } from 'framer-motion';
import { Upload, FileText } from 'lucide-react';
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Document, Page, pdfjs } from 'react-pdf';
import { renderAsync } from 'docx-preview';
import { FaceTrackingPopup } from '../components/FaceTrackingPopup';
import { AutoHelpPopup } from '../components/AutoHelpPopup';
import { Button } from '../components/Button';
import type { FaceTrackerSnapshot } from '../components/FaceTracker';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export function StudyView() {
  const [showHelp, setShowHelp] = useState(false);
  const [helpLevel, setHelpLevel] = useState<1 | 2 | 3>(1);
  const [helpTopic, setHelpTopic] = useState('General');
  const [helpLoaded, setHelpLoaded] = useState(false);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpExplanations, setHelpExplanations] = useState<{ level1: string; level2: string; level3: string }>({
    level1: '',
    level2: '',
    level3: '',
  });
  const [helpDoubt, setHelpDoubt] = useState('');
  const [helpAnswer, setHelpAnswer] = useState('');
  const [helpAnswerLoading, setHelpAnswerLoading] = useState(false);

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
  const lastSentContextRef = useRef<{ sectionId: string; topic: string; paragraph: string } | null>(null);
  const lastHelpShownAtMsRef = useRef<number>(0);
  const pdfDocProxyRef = useRef<any | null>(null);
  const pdfDocLoadingRef = useRef<Promise<any> | null>(null);
  const pdfPageTopicCacheRef = useRef<Map<number, string>>(new Map());
  const pdfPageTextCacheRef = useRef<Map<number, string>>(new Map());

  const helpLockedSectionIdRef = useRef<string | null>(null);
  const helpLockedTopicRef = useRef<string | null>(null);
  const helpLockedPageRef = useRef<number | null>(null);
  const helpLockedParagraphRef = useRef<string | null>(null);

  // Live face snapshot (attention & emotion), forwarded from FaceTrackingPopup.
  const faceSnapshotRef = useRef<FaceTrackerSnapshot | null>(null);

  // Behavior features (scroll-derived)
  const lastScrollAtMsRef = useRef<number>(Date.now());
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollSpeedRef = useRef<number>(0);
  const reReadCountSinceLastSendRef = useRef<number>(0);
  const lastBehaviorSentAtMsRef = useRef<number>(0);

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
    return 'unknown';
  }, [contentDoc, fileUrl]);

  // Initialize popup state when opened.
  useEffect(() => {
    if (!showHelp) return;
    setHelpLevel(1);
    setHelpLoaded(false);
    setHelpLoading(false);
    setHelpTopic((currentTopic && currentTopic.trim()) ? currentTopic.trim() : 'General');
    setHelpExplanations({
      level1: 'I can explain this in more detail. Click “Show More” to get an explanation.',
      level2: '',
      level3: '',
    });
    setHelpDoubt('');
    setHelpAnswer('');
    setHelpAnswerLoading(false);
  }, [showHelp, currentTopic]);

  const getHelpTextForLevel = useCallback((level: 1 | 2 | 3) => {
    if (level === 1) return helpExplanations.level1;
    if (level === 2) return helpExplanations.level2;
    return helpExplanations.level3;
  }, [helpExplanations.level1, helpExplanations.level2, helpExplanations.level3]);

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

  const fetchExplainIfNeeded = useCallback(async (directParagraph?: string, directTopic?: string) => {
    if (helpLoaded || helpLoading) return;

    const userId = user?.userId || (await ensureUserId());
    if (!userId) return;

    setHelpLoading(true);
    setHelpExplanations((prev) => ({ ...prev, level1: 'Loading explanation...' }));

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 25000);

    try {
      // Always fall back to the locked refs so Show More also sends the visible page text
      const reqParagraph = directParagraph || helpLockedParagraphRef.current || undefined;
      const reqTopic = directTopic || helpLockedTopicRef.current || undefined;

      const body: Record<string, unknown> = { userId, agentActive: true, mode: 'study' };
      if (reqParagraph) body.paragraph = reqParagraph;
      if (reqTopic) body.topic = reqTopic;

      const resp = await fetch(`${API}/api/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = typeof (data as any)?.error === 'string' ? (data as any).error : `Explain failed (${resp.status})`;
        throw new Error(msg);
      }

      const topic = typeof data?.topic === 'string' && data.topic.trim() ? data.topic.trim() : helpTopic;
      setHelpTopic(topic || helpTopic);
      setHelpExplanations({
        level1: typeof data?.level1 === 'string' ? data.level1 : '',
        level2: typeof data?.level2 === 'string' ? data.level2 : '',
        level3: typeof data?.level3 === 'string' ? data.level3 : '',
      });
      setHelpLoaded(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Explain failed';
      setHelpExplanations({ level1: msg, level2: msg, level3: msg });
      setHelpLoaded(false);
    } finally {
      window.clearTimeout(timeoutId);
      setHelpLoading(false);
    }
  }, [API, currentTopic, ensureUserId, helpLoaded, helpLoading, helpTopic, user?.userId]);

  const onHelpShowMore = useCallback(async () => {
    // Only call /api/explain when the user requests more (moving from Level 1 -> Level 2).
    if (helpLevel === 1 && !helpLoaded && !helpLoading) {
      await fetchExplainIfNeeded();
      setHelpLevel(2);
      return;
    }

    setHelpLevel((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : 3));
  }, [fetchExplainIfNeeded, helpLevel, helpLoaded, helpLoading]);

  const onHelpUnderstand = useCallback(async () => {
    const userId = user?.userId;
    try {
      if (!userId) return;
      await fetch(`${API}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          topic: helpTopic,
          levelSeen: helpLevel,
          understood: true,
        }),
      });
    } catch {
      // ignore
    } finally {
      setShowHelp(false);
    }
  }, [API, helpLevel, helpTopic, user?.userId]);

  const onHelpSubmitDoubt = useCallback(async () => {
    const userId = user?.userId;
    if (!userId) return;
    const question = helpDoubt.trim();
    if (!question) return;
    setHelpAnswerLoading(true);
    setHelpAnswer('Thinking...');
    try {
      if (fileType === 'pdf') {
        const lockedSectionId = helpLockedSectionIdRef.current;
        const lockedTopic = helpLockedTopicRef.current;
        const paragraph = String(helpLockedParagraphRef.current || '').trim();
        if (lockedSectionId && lockedTopic) {
          try {
            await fetch(`${API}/api/context`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                agentActive: true,
                topic: lockedTopic,
                sectionId: lockedSectionId,
                paragraph: paragraph || undefined,
                contentId: contentId || undefined,
                metadata: { title: uploadedTitle || undefined },
              }),
            });
          } catch {
            // ignore
          }
        }
      }

      const lockedPara = String(helpLockedParagraphRef.current || '').trim();
      const lockedTpc = String(helpLockedTopicRef.current || '').trim();
      const doubtBody: Record<string, unknown> = { userId, mode: 'study', question };
      if (lockedPara) doubtBody.paragraph = lockedPara;
      if (lockedTpc) doubtBody.topic = lockedTpc;

      const resp = await fetch(`${API}/api/ask-doubt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doubtBody),
      });
      const data = await resp.json().catch(() => ({}));
      const answer = typeof data?.answer === 'string' ? data.answer : '';
      setHelpAnswer(answer || 'No answer returned.');
    } catch {
      setHelpAnswer('Failed to get an answer.');
    } finally {
      setHelpAnswerLoading(false);
    }
  }, [API, contentId, fileType, helpDoubt, uploadedTitle, user?.userId]);

  const detectTopicClient = useCallback((rawText: string) => {
    const text = String(rawText || '').toLowerCase();
    if (text.includes('binary tree')) return 'Binary Trees';
    if (text.includes('graph')) return 'Graphs';
    if (text.includes('array')) return 'Arrays';
    return 'General';
  }, []);

  const detectTopicServer = useCallback(async (rawText: string) => {
    const text = String(rawText || '').trim();
    if (!text) return 'General';

    const userId = await ensureUserId();
    if (!userId) return 'General';

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 7000);

    try {
      const resp = await fetch(`${API}/api/topic/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, agentActive: true, text: text.slice(0, 1800) }),
        signal: controller.signal,
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return 'General';
      const topic = typeof (data as any)?.topic === 'string' ? String((data as any).topic).trim() : '';
      return topic || 'General';
    } catch {
      return 'General';
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [API, ensureUserId]);

  useEffect(() => {
    // Reset per-document caches when the file changes
    pdfDocProxyRef.current = null;
    pdfDocLoadingRef.current = null;
    pdfPageTopicCacheRef.current.clear();
    pdfPageTextCacheRef.current.clear();
    lastSentContextRef.current = null;

    helpLockedSectionIdRef.current = null;
    helpLockedTopicRef.current = null;
    helpLockedPageRef.current = null;
    helpLockedParagraphRef.current = null;

    // Reset behavior features for new document
    lastScrollAtMsRef.current = Date.now();
    lastScrollTopRef.current = 0;
    lastScrollSpeedRef.current = 0;
    reReadCountSinceLastSendRef.current = 0;
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

  const getPdfPageText = useCallback(async (pageNumber: number) => {
    const cached = pdfPageTextCacheRef.current.get(pageNumber);
    if (cached) return cached;

    const doc = await getPdfDocProxy();
    if (!doc) return '';

    try {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const joined = Array.isArray(textContent?.items)
        ? textContent.items
            .map((it: any) => (it && typeof it.str === 'string' ? it.str : ''))
            .filter(Boolean)
            .join(' ')
        : '';

      const normalized = String(joined || '').replace(/\s+/g, ' ').trim();
      const MAX_PAGE_TEXT_CHARS = 2200;
      const clamped = normalized.length > MAX_PAGE_TEXT_CHARS ? normalized.slice(0, MAX_PAGE_TEXT_CHARS) : normalized;

      pdfPageTextCacheRef.current.set(pageNumber, clamped);
      return clamped;
    } catch {
      return '';
    }
  }, [getPdfDocProxy]);

  const getPdfHelpParagraph = useCallback(async (pageNumber: number) => {
    const base = await getPdfPageText(pageNumber);

    // If the page has very little extractable text (e.g., mostly diagrams), expand to neighbors.
    const MIN_HELP_CHARS = 200;
    if (base.length >= MIN_HELP_CHARS) return base;

    const parts: string[] = [];
    const prev = pageNumber - 1 >= 1 ? await getPdfPageText(pageNumber - 1) : '';
    const next = pageNumber + 1 <= (numPages || pageNumber + 1) ? await getPdfPageText(pageNumber + 1) : '';

    if (prev) parts.push(prev);
    if (base) parts.push(base);
    if (next) parts.push(next);

    const joined = parts.join('\n\n---\n\n').trim();
    const MAX_HELP_CHARS = 2200;
    return joined.length > MAX_HELP_CHARS ? joined.slice(0, MAX_HELP_CHARS) : joined;
  }, [getPdfPageText, numPages]);

  const getPdfPageTopic = useCallback(async (pageNumber: number) => {
    const cached = pdfPageTopicCacheRef.current.get(pageNumber);
    if (cached) return cached;

    try {
      const pageText = await getPdfPageText(pageNumber);
      let topic = detectTopicClient(pageText);
      if (topic === 'General') {
        topic = await detectTopicServer(pageText);
      }
      pdfPageTopicCacheRef.current.set(pageNumber, topic);
      return topic;
    } catch {
      return 'General';
    }
  }, [detectTopicClient, detectTopicServer, getPdfPageText]);

  const postInternalContext = useCallback(
    async ({ topic, sectionId, paragraph }: { topic: string; sectionId: string; paragraph?: string }) => {
      if (!agentActive) return;

      const normalizedTopic = String(topic || '').trim() || 'General';
      const normalizedSectionId = String(sectionId || '').trim();
      if (!normalizedSectionId) return;

      const normalizedParagraph = String(paragraph || '').trim();

      const last = lastSentContextRef.current;
      if (
        last
        && last.sectionId === normalizedSectionId
        && last.topic === normalizedTopic
        && last.paragraph === normalizedParagraph
      ) {
        return;
      }

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
            paragraph: normalizedParagraph || undefined,
            contentId: contentId || undefined,
            metadata: { title: uploadedTitle || undefined },
          }),
        });
      } catch {
        // ignore network errors; still update UI for responsiveness
      }

      lastSentContextRef.current = { sectionId: normalizedSectionId, topic: normalizedTopic, paragraph: normalizedParagraph };
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

  const lockHelpToCurrentPdfPageIfNeeded = useCallback(async () => {
    if (!showHelp) return;
    if (fileType !== 'pdf') return;
    if (helpLockedPageRef.current && helpLockedSectionIdRef.current && helpLockedTopicRef.current) return;

    const container = pdfScrollContainerRef.current;
    if (!container) return;

    const pageNumber = findMostVisibleDataPage(container);
    if (!pageNumber) return;

    const sectionId = `p${pageNumber}`;
    const pageText = await getPdfHelpParagraph(pageNumber);
    const topic = await getPdfPageTopic(pageNumber);
    await postInternalContext({ sectionId, topic, paragraph: pageText });

    helpLockedPageRef.current = pageNumber;
    helpLockedSectionIdRef.current = sectionId;
    helpLockedTopicRef.current = topic;
    helpLockedParagraphRef.current = pageText;
  }, [fileType, findMostVisibleDataPage, getPdfHelpParagraph, getPdfPageTopic, postInternalContext, showHelp]);

  useEffect(() => {
    if (showHelp) return;
    helpLockedPageRef.current = null;
    helpLockedSectionIdRef.current = null;
    helpLockedTopicRef.current = null;
    helpLockedParagraphRef.current = null;
  }, [showHelp]);

  useEffect(() => {
    if (!showHelp) return;

    let cancelled = false;

    (async () => {
      let capturedParagraph: string | undefined;
      let capturedTopic: string | undefined;

      if (fileType === 'pdf') {
        await lockHelpToCurrentPdfPageIfNeeded();

        const lockedPage = helpLockedPageRef.current;
        const lockedSectionId = helpLockedSectionIdRef.current;
        const lockedTopic = helpLockedTopicRef.current;
        const lockedParagraph = helpLockedParagraphRef.current;

        if (lockedPage && lockedSectionId && lockedTopic) {
          const paragraph = lockedParagraph || (await getPdfHelpParagraph(lockedPage));
          await postInternalContext({ sectionId: lockedSectionId, topic: lockedTopic, paragraph });
          if (!cancelled) setHelpTopic(lockedTopic);
          capturedParagraph = paragraph || undefined;
          capturedTopic = lockedTopic;
        }
      }

      if (cancelled) return;
      await fetchExplainIfNeeded(capturedParagraph, capturedTopic);
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchExplainIfNeeded, fileType, getPdfHelpParagraph, lockHelpToCurrentPdfPageIfNeeded, postInternalContext, showHelp]);

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
      const pageText = await getPdfPageText(pageNumber);
      const topic = await getPdfPageTopic(pageNumber);
      await postInternalContext({ topic, sectionId: `p${pageNumber}`, paragraph: pageText });
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
      let topic = detectTopicClient(raw);
      if (topic === 'General') {
        topic = await detectTopicServer(raw);
      }
      await postInternalContext({ topic, sectionId: 'docx' });
    }
  }, [
    absoluteFileUrl,
    agentActive,
    detectTopicClient,
    detectTopicServer,
    fileType,
    findMostVisibleDataPage,
    findMostVisibleHeading,
    getPdfPageText,
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

    // Initialize baselines for behavior features
    lastScrollAtMsRef.current = Date.now();
    lastScrollTopRef.current = container.scrollTop;

    const schedule = () => {
      if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = window.setTimeout(() => {
        void handleReadingPause();
      }, 3000);
    };

    const onScroll = () => {
      const now = Date.now();
      const y = container.scrollTop;

      const prevY = lastScrollTopRef.current;
      const prevAt = lastScrollAtMsRef.current;

      const dy = y - prevY;
      const dtSec = Math.max(0.001, (now - prevAt) / 1000);

      // re-read == user scrolls upward
      if (dy < 0) reReadCountSinceLastSendRef.current += 1;

      lastScrollSpeedRef.current = Math.abs(dy) / dtSec;
      lastScrollTopRef.current = y;
      lastScrollAtMsRef.current = now;

      schedule();
    };

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

  // Stream behavior_vector to ML every ~5 seconds while studying.
  useEffect(() => {
    if (!agentActive) return;
    if (!hasDocument) return;

    const SEND_INTERVAL_MS = 5000;
    const PAUSE_CAP_SEC = 60;
    const SCROLL_SPEED_CAP_PX_PER_SEC = 2000;
    const REREAD_CAP_COUNT = 10;
    const COOLDOWN_MS = 5000;
    const HELP_POPUP_COOLDOWN_MS = 30_000;

    let stopped = false;

    const tick = async () => {
      if (stopped) return;

      // Cooldown guard (avoid accidental bursts due to effect restarts/tab visibility/etc.)
      const nowMs = Date.now();
      if (nowMs - lastBehaviorSentAtMsRef.current < COOLDOWN_MS) return;

      const container = fileType === 'pdf'
        ? pdfScrollContainerRef.current
        : fileType === 'docx'
          ? docxScrollContainerRef.current
          : null;

      if (!container) return;

      const userId = await ensureUserId();
      if (!userId) return;

      const pauseTimeSec = Math.min(PAUSE_CAP_SEC, Math.max(0, (nowMs - lastScrollAtMsRef.current) / 1000));
      const scrollSpeed = Math.min(
        SCROLL_SPEED_CAP_PX_PER_SEC,
        Math.max(0, lastScrollSpeedRef.current || 0)
      );
      const reReadCount = Math.min(
        REREAD_CAP_COUNT,
        Math.max(0, reReadCountSinceLastSendRef.current || 0)
      );

      const attentionFromFace = faceSnapshotRef.current?.attention_score;
      const attentionScore = (() => {
        const n = typeof attentionFromFace === 'number' ? attentionFromFace : Number(attentionFromFace);
        // Neutral fallback when camera/face snapshot is unavailable
        // 1.0 = fully attentive, 0.5 = unknown/neutral, 0.0 = not attentive
        if (!Number.isFinite(n)) return 0.5;
        return Math.max(0, Math.min(1, n));
      })();

      // Meaningful fatigue heuristic (0..1)
      // - long pause => fatigue
      // - very slow scroll => disengagement
      // - low attention => fatigue
      let fatigueScore = 0;
      if (pauseTimeSec > 8) fatigueScore += 0.4;
      if (scrollSpeed < 100) fatigueScore += 0.3;
      if (attentionScore < 0.5) fatigueScore += 0.3;
      fatigueScore = Math.max(0, Math.min(1, fatigueScore));

      const behavior_vector = [
        +pauseTimeSec.toFixed(3),
        +scrollSpeed.toFixed(3),
        reReadCount,
        +attentionScore.toFixed(3),
        +fatigueScore.toFixed(3),
      ];

      // Reset reRead count so it reflects recent behavior
      reReadCountSinceLastSendRef.current = 0;

      const payload = {
        topic: (currentTopic || 'General'),
        behavior_vector,
        timestamp: Math.floor(nowMs / 1000),
      };

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('Behavior Vector:', payload);
      }

      try {
        // Server-authoritative confusion detection (backend does ML call + smoothing + CSV logging + DB write-on-true)
        const mlRes = await fetch(`${API}/api/confusion/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            agentActive: true,
            topic: payload.topic,
            behavior_vector: payload.behavior_vector,
            timestamp: payload.timestamp,
          }),
        });

        const mlJson = await mlRes.json().catch(() => null);
        if (import.meta.env.DEV && !mlRes.ok) {
          // eslint-disable-next-line no-console
          console.warn(`[ml] Backend predict failed (${mlRes.status}). Response:`, mlJson);
        }

        // Confusion is detected ONLY through backend ML decision.
        const isConfused = Boolean(mlJson && typeof mlJson === 'object' && (mlJson as any).confusion === true);
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[ml] backend prediction:', mlJson, 'confusion=', isConfused);
        }

        if (isConfused) {
          const lastShown = lastHelpShownAtMsRef.current || 0;
          if (nowMs - lastShown >= HELP_POPUP_COOLDOWN_MS) {
            lastHelpShownAtMsRef.current = nowMs;

            // Pre-lock visible page content into refs BEFORE opening the popup so
            // both the auto explain call and any immediate "Show More" click can
            // use the paragraph without waiting for the effect to resolve.
            if (fileType === 'pdf' && pdfScrollContainerRef.current) {
              const pageNum = findMostVisibleDataPage(pdfScrollContainerRef.current);
              if (pageNum && !helpLockedPageRef.current) {
                const sId = `p${pageNum}`;
                try {
                  const [para, tpc] = await Promise.all([
                    getPdfHelpParagraph(pageNum),
                    getPdfPageTopic(pageNum),
                  ]);
                  helpLockedPageRef.current = pageNum;
                  helpLockedSectionIdRef.current = sId;
                  helpLockedParagraphRef.current = para;
                  helpLockedTopicRef.current = tpc;
                  void postInternalContext({ sectionId: sId, topic: tpc, paragraph: para });
                } catch {
                  // ignore — popup still opens, effect will retry
                }
              }
            }

            setHelpTopic(helpLockedTopicRef.current || payload.topic);
            setShowHelp(true);
          }
        }

        lastBehaviorSentAtMsRef.current = nowMs;
      } catch {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[ml] Backend predict endpoint unreachable. Start backend or check VITE_API_URL.');
        }
        lastBehaviorSentAtMsRef.current = nowMs;
      }
    };

    // fire once immediately, then interval
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, SEND_INTERVAL_MS);

    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [API, agentActive, ensureUserId, fileType, hasDocument, currentTopic]);

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

    const type = (f.type || '').toLowerCase();
    if (type.includes('pdf')) return true;
    if (type.includes('wordprocessingml') || type.includes('msword')) return true;
    return false;
  };

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isSupportedFile(file)) {
      setUploadError('Please select a PDF (.pdf) or Word (.docx/.doc) file.');
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
              accept=".pdf,.docx,.doc,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                Upload a PDF or Word document to begin studying
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
                Supports PDF (.pdf), Word (.docx/.doc)
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
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <a
                      href={absoluteFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-violet-700 dark:text-violet-300"
                    >
                      Open original file
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setShowHelp(false);
                        setHasDocument(false);
                        setUploading(false);
                        setUploadError(null);
                        setUploadedTitle(null);
                        setContentId(null);
                        setContentDoc(null);
                        setFileUrl(null);
                        setNumPages(0);
                        setZoom(1);

                        // Reset behavior features
                        lastScrollAtMsRef.current = Date.now();
                        lastScrollTopRef.current = 0;
                        lastScrollSpeedRef.current = 0;
                        reReadCountSinceLastSendRef.current = 0;
                      }}
                      className="px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-gray-800 dark:text-gray-200 text-sm"
                      aria-label="Remove document"
                    >
                      Remove doc
                    </button>
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

      <FaceTrackingPopup
        enabled={cameraActive}
        onSnapshot={(s) => {
          faceSnapshotRef.current = s;
        }}
      />

      <AutoHelpPopup
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        topic={helpTopic}
        level={helpLevel}
        text={getHelpTextForLevel(helpLevel)}
        onUnderstand={onHelpUnderstand}
        onShowMore={helpLevel < 3 ? onHelpShowMore : undefined}
        showMoreDisabled={helpLoading}
        extra={
          helpLevel === 3 ? (
            <div className="space-y-2">
              <input
                value={helpDoubt}
                onChange={(e) => setHelpDoubt(e.target.value)}
                placeholder="Ask your doubt..."
                className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none"
              />
              <div className="flex justify-end">
                <Button variant="secondary" onClick={onHelpSubmitDoubt} disabled={helpAnswerLoading || !helpDoubt.trim()}>
                  Submit
                </Button>
              </div>
              {helpAnswer ? (
                <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {helpAnswer}
                </div>
              ) : null}
            </div>
          ) : null
        }
      />
    </div>
  );
}
