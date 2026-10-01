import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div role="status" aria-label="Loading workspace" className="space-y-6"><div className="space-y-3"><Skeleton className="h-3 w-32" /><Skeleton className="h-9 w-64" /><Skeleton className="h-4 w-96 max-w-full" /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36" />)}</div><div className="grid gap-5 xl:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div><span className="sr-only">Loading…</span></div>;
}
