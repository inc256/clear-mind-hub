const History = () => (
  <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
    <header className="space-y-2">
      <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
        Activity History
      </h1>
      <p className="text-muted-foreground text-sm">Your recent activities will appear here.</p>
    </header>

    <div className="glass-card rounded-2xl p-6 text-center">
      <p className="text-muted-foreground">No activities yet. Start using the app!</p>
    </div>
  </div>
);

export default History;