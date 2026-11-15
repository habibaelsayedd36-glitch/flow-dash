export default function Loading() {
  return (
    <div aria-busy="true" className="animate-pulse">
      <span className="sr-only" role="status">
        Loading… جارٍ التحميل…
      </span>
      <div className="h-8 w-48 rounded-lg bg-sage" />
      <div className="mt-3 h-4 w-80 max-w-full rounded bg-sage" />
      <div className="mt-8 h-48 rounded-3xl bg-sage" />
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-sage" />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-56 rounded-2xl bg-sage" />
        <div className="h-56 rounded-2xl bg-sage" />
      </div>
    </div>
  );
}
