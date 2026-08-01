import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/ui/brand';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><BrandLogo showSlogan /></div>
        <Card className="p-6">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </Card>
      </div>
    </div>
  );
}

export function AuthFooterLinks({ links }: { links: { to: string; label: string }[] }) {
  return (
    <div className="mt-5 flex flex-wrap justify-center gap-4 text-sm">
      {links.map((l) => <Link key={l.to} to={l.to} className="font-bold text-brand-orange hover:underline">{l.label}</Link>)}
    </div>
  );
}

export function SubmitRow({ loading, label }: { loading?: boolean; label: string }) {
  return <Button type="submit" className="w-full" size="lg" loading={loading}>{label}</Button>;
}
