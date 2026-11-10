/**
 * Browser half of the arena's DeepSeek Harness integration.
 *
 * It contributes one panel: a sidebar entry plus a main-column view that frames
 * the arena's own `?embed=1` spectator page. Nothing about the board is
 * reimplemented here, so the DSH view and the browser view are the same page,
 * the same renderer and the same SSE stream.
 */
window.__ModuleLoader__.load({
  id: '@local/topology-gomoku-arena',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'topology-arena'
    /** Sidebar panel id; the main-panel key must match. */
    const PANEL_ID = 'topology-arena'
    /** Host route serving the panel read model. */
    const API = '/topology-arena/api/view'

    const TEXT = {
      zh: {
        panel: '对弈室',
        refresh: '刷新',
        open: '在浏览器打开',
        startService: '启动服务',
        stopService: '结束服务',
        stopConfirm: '结束本地对弈服务？进行中的棋局会保留，棋手与观战会断开。',
        offline: '对弈服务未运行',
        offlineHint: '在对话里让 agent 用 arena_service start 启动本地服务。',
        frameHint: '如果这段提示一直显示，说明画面没有加载成功；请用右上角“在浏览器打开”。',
        phase: { waiting: '等待入席', playing: '对局中', paused: '暂停', ended: '已结束' },
        topology: { plane: '平面', cylinder: '圆柱', torus: '环面', mobius: '莫比乌斯环', klein: '克莱因瓶', projective: '实射影平面', sphere: '球面' },
        ply: '第 {n} 手',
      },
      en: {
        panel: 'Arena',
        refresh: 'Refresh',
        open: 'Open in browser',
        startService: 'Start service',
        stopService: 'Stop service',
        stopConfirm: 'Stop the local arena service? Matches are kept, but players and spectators disconnect.',
        offline: 'The arena service is not running',
        offlineHint: 'Ask the agent to run arena_service start in the conversation.',
        frameHint: 'If this note stays visible, the page did not load; use “Open in browser”.',
        phase: { waiting: 'Lobby', playing: 'Playing', paused: 'Paused', ended: 'Finished' },
        topology: { plane: 'Plane', cylinder: 'Cylinder', torus: 'Torus', mobius: 'Möbius strip', klein: 'Klein bottle', projective: 'Projective plane', sphere: 'Sphere' },
        ply: 'ply {n}',
      },
    }

    /** Pick a message table for the active locale. */
    function tableFor(ctx) {
      try {
        const snapshot = ctx.locale.getLocale()
        const id = snapshot && typeof snapshot === 'object' ? snapshot.active || snapshot.id : null
        if (typeof id === 'string' && id.toLowerCase().startsWith('zh')) return TEXT.zh
      } catch {
        /* fall through to the default language */
      }
      return TEXT.en
    }

    /** Read the Host once; the embedded page owns its own navigation afterwards. */
    function useView() {
      const [state, setState] = React.useState({ loading: true, data: null })
      const load = React.useCallback(async () => {
        try {
          const response = await fetch(API, { headers: { accept: 'application/json' }, cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json()
          setState({ loading: false, data })
        } catch (error) {
          setState({ loading: false, data: { url: '', running: false, error: String(error && error.message ? error.message : error) } })
        }
      }, [])
      React.useEffect(() => {
        load()
      }, [load])
      return { ...state, reload: load }
    }

    /** The sidebar entry glyph. */
    function PanelIcon({ size }) {
      const edge = Math.max(14, size || 18)
      return h('svg', {
        width: edge, height: edge, viewBox: '0 0 24 24', 'aria-hidden': true,
        style: { display: 'block' },
      }, [
        h('path', { key: 'grid', d: 'M4 8h16M4 12h16M4 16h16M8 4v16M12 4v16M16 4v16', stroke: 'currentColor', strokeWidth: 1.1, opacity: 0.55, fill: 'none' }),
        h('circle', { key: 'a', cx: 12, cy: 12, r: 3, fill: 'currentColor' }),
        h('circle', { key: 'b', cx: 16, cy: 8, r: 2.4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
      ])
    }

    /** One labelled action in the panel header. */
    function headerButton(label, onClick) {
      return h('button', {
        type: 'button',
        onClick,
        style: {
          font: 'inherit', fontSize: 12, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--dsw-alias-border-l1)',
          background: 'var(--dsw-alias-bg-layer-1)',
          color: 'var(--dsw-alias-label-primary)',
        },
      }, label)
    }

    /** The embedded arena page, framed exactly as the browser renders it. */
    function ArenaPanel({ t }) {
      const { data, reload } = useView()
      const [nonce, setNonce] = React.useState(0)
      const base = data && data.url ? data.url : ''
      // The fragment carries the host credential into the frame without a
      // server round trip; the arena page consumes and clears it on boot.
      const hostSuffix = data && data.hostToken ? `#host=${encodeURIComponent(data.hostToken)}` : ''
      // Always open the arena home; the page's own settings/records dialog is
      // how a match is chosen, so the panel never deep-links into a stale game.
      const src = base ? `${base}/?embed=1${hostSuffix}` : ''
      const browserHref = base ? `${base}/` : ''
      const running = Boolean(data && data.running)

      /** Start or stop the local service and remount the frame. */
      const toggleService = async () => {
        if (running && typeof window !== 'undefined' && typeof window.confirm === 'function'
          && !window.confirm(t.stopConfirm)) return
        try {
          await fetch(`/topology-arena/api/${running ? 'stop' : 'start'}`, { method: 'POST' })
        } catch {
          /* the reload below reports the real state */
        }
        setNonce((value) => value + 1)
        reload()
      }

      const header = h('header', {
        key: 'header',
        style: {
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          borderBottom: '1px solid var(--dsw-alias-border-l1)',
          background: 'var(--dsw-alias-bg-layer-1)', flex: '0 0 auto', flexWrap: 'wrap',
        },
      }, [
        h('div', { key: 'spacer', style: { flex: 1 } }),
        headerButton(running ? t.stopService : t.startService, toggleService),
        headerButton(t.refresh, () => {
          setNonce((value) => value + 1)
          reload()
        }),
        browserHref
          ? h('a', {
              key: 'open',
              href: browserHref,
              target: '_blank',
              rel: 'noreferrer',
              style: {
                fontSize: 12, padding: '5px 10px', borderRadius: 8,
                border: '1px solid var(--dsw-alias-border-l1)',
                color: 'var(--dsw-alias-label-primary)', textDecoration: 'none',
              },
            }, t.open)
          : null,
      ])

      let body
      if (data && !data.running) {
        body = h('div', { key: 'offline', style: hintStyle }, [
          h('div', { key: 'a', style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, t.offline),
          h('div', { key: 'b' }, t.offlineHint),
        ])
      } else if (src) {
        body = [
          h('div', { key: 'hint', style: frameHintStyle }, [
            h('div', { key: 'a', style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, t.panel),
            h('div', { key: 'b' }, t.frameHint),
          ]),
          h('iframe', {
            key: `frame-${nonce}`,
            src,
            title: t.panel,
            referrerPolicy: 'no-referrer',
            allow: 'clipboard-write',
            style: {
              position: 'absolute', inset: 0, border: 0, width: '100%', height: '100%',
              display: 'block', background: 'transparent',
            },
          }),
        ]
      } else {
        body = h('div', { key: 'loading', style: hintStyle }, t.panel)
      }

      return h('div', {
        style: { height: '100%', minHeight: '60vh', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base)' },
      }, [header, h('div', { key: 'body', style: { flex: 1, minHeight: 0, position: 'relative' } }, body)])
    }

    const hintStyle = {
      display: 'grid', gap: 6, placeContent: 'center', padding: 32, textAlign: 'center',
      fontSize: 12, color: 'var(--dsw-alias-label-secondary)',
    }

    const frameHintStyle = {
      position: 'absolute', inset: 0, display: 'grid', gap: 6, placeContent: 'center',
      padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--dsw-alias-label-secondary)',
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = tableFor(ctx)
        for (const locale of ['zh', 'en']) {
          try {
            ctx.locale.register(NS, locale, { panel: TEXT[locale].panel })
          } catch {
            /* the label thunk below still provides the name */
          }
        }
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, () => h(ArenaPanel, { t })))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 12,
          label: () => t.panel,
          locale: NS,
        }, PanelIcon))
      },
    }
  },
})
