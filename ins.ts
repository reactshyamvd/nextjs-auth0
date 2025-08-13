// instrumentation-client.ts
import posthog from 'posthog-js'

// Read cookie helper
function getCookie(name: string) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
    return match ? decodeURIComponent(match[2]) : undefined
}

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ''
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.posthog.com'

if (POSTHOG_KEY) {
    const distinctId = getCookie("ph_distinct_id")

    posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        capture_pageview: true,
        disable_session_recording: false,
        bootstrap: distinctId ? { distinctID: distinctId } : undefined,
        loaded: (ph) => {
            if (process.env.NODE_ENV === 'development') ph.debug()
        },
    })

    // Register UI variant
    const ssUi = getCookie('ss_ui')
    if (ssUi) {
        posthog.register({
            ui_variant: ssUi === 'always' ? 'new' : 'legacy',
            source: 'posthog',
        })
    }
}

export default posthog
