export function ScenarioLinks({ isNext }: { isNext: boolean }) {
  return <nav className="route-links" aria-label="Prize scenario">
    <a href="/" aria-current={!isNext ? 'page' : undefined}>Settled match</a>
    <a href="/next" aria-current={isNext ? 'page' : undefined}>Upcoming match</a>
  </nav>;
}
