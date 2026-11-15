import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Trash2 } from 'lucide-react';
import {
  SOCIAL_PROVIDER_LABELS,
  type SocialAccountDto,
  type SocialProvider,
  type SocialProviderStatusDto,
} from '@piwu/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

const errorMessage = (err: unknown) =>
  ((err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message ?? 'Error')
    .toString();

/** Link YouTube / Instagram / TikTok accounts (OAuth) for publishing. */
export function AccountsPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const linked = params.get('linked');
  const oauthError = params.get('error');

  const providers = useQuery({
    queryKey: ['social', 'providers'],
    queryFn: async () => (await api.get<SocialProviderStatusDto[]>('/social/providers')).data,
  });
  const accounts = useQuery({
    queryKey: ['social', 'accounts'],
    queryFn: async () => (await api.get<SocialAccountDto[]>('/social/accounts')).data,
  });

  useEffect(() => {
    if (linked) void queryClient.invalidateQueries({ queryKey: ['social', 'accounts'] });
  }, [linked, queryClient]);

  const connect = useMutation({
    mutationFn: async (provider: SocialProvider) =>
      (await api.get<{ url: string }>(`/social/${provider}/connect`)).data.url,
    onSuccess: (url) => {
      window.location.href = url;
    },
  });
  const unlink = useMutation({
    mutationFn: async (id: string) => api.delete(`/social/accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'accounts'] }),
  });

  const list = Array.isArray(accounts.data) ? accounts.data : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">Cuentas</h1>
        <p className="mt-1 text-sm text-mist">
          Vincula tus redes para publicar o programar tus clips directamente.
        </p>
      </div>

      {linked ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Cuenta de {SOCIAL_PROVIDER_LABELS[linked as SocialProvider] ?? linked} vinculada.{' '}
          <button className="underline" onClick={() => setParams({})}>
            Cerrar
          </button>
        </p>
      ) : null}
      {oauthError ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          No se pudo vincular: {oauthError}{' '}
          <button className="underline" onClick={() => setParams({})}>
            Cerrar
          </button>
        </p>
      ) : null}
      {connect.isError ? <p className="text-sm text-red-400">{errorMessage(connect.error)}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        {(Array.isArray(providers.data) ? providers.data : []).map((status) => {
          const mine = list.filter((account) => account.provider === status.provider);
          return (
            <section
              key={status.provider}
              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-ink-900/70 p-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg text-white">{status.label}</h2>
                <span
                  className={
                    status.configured
                      ? 'rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300'
                      : 'rounded bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300'
                  }
                >
                  {status.configured ? 'disponible' : 'sin configurar'}
                </span>
              </div>

              {mine.length ? (
                <ul className="space-y-2">
                  {mine.map((account) => (
                    <li key={account.id} className="flex items-center gap-2 rounded-lg bg-ink-950/70 p-2">
                      {account.avatarUrl ? (
                        <img src={account.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-white/10" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-white">{account.displayName}</span>
                      <button
                        type="button"
                        aria-label={`Desvincular ${account.displayName}`}
                        className="text-mist hover:text-red-400"
                        onClick={() => {
                          if (confirm(`¿Desvincular ${account.displayName}? Sus publicaciones programadas se eliminarán.`)) {
                            unlink.mutate(account.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-mist">Ninguna cuenta vinculada.</p>
              )}

              <Button
                type="button"
                size="sm"
                disabled={!status.configured || connect.isPending}
                onClick={() => connect.mutate(status.provider)}
              >
                <Link2 className="h-4 w-4" /> {mine.length ? 'Vincular otra' : 'Vincular'}
              </Button>

              {!status.configured ? (
                <p className="text-[11px] text-amber-200/80">
                  El administrador debe configurar: {status.missing.join(', ')}.
                </p>
              ) : null}
              <ul className="list-disc space-y-1 pl-4 text-[11px] text-mist">
                {status.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
