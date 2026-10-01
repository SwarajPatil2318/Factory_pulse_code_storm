import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { SearchX } from "lucide-react";

export default function NotFound() { return <Card><CardContent className="pt-5 sm:pt-6"><EmptyState icon={SearchX} title="Page not found" description="This workspace page does not exist."><Button asChild><Link href="/">Return to overview</Link></Button></EmptyState></CardContent></Card>; }
