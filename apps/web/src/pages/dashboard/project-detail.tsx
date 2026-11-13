import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import type { ProjectDto } from '@piwu/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AuthImage } from '@/components/auth-image';
import {
  ROLE_CAPS,
  ROLE_LABELS,
  fileToReference,
  type ReferenceRole,
} from '@/lib/reference-upload';

const ROLES: ReferenceRole[] = ['protagonist', 'scenery', 'style'];

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: project, isLoading } = useQuery({
    queryKey: ['projects', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<ProjectDto>(`/projects/${id}`);
      return res.data;
    },
  });

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDescription(project.description);
  }, [project?.id]);

  const counts = useMemo(() => {
    const map: Record<ReferenceRole, number> = {
      protagonist: 0,
      scenery: 0,
      style: 0,
    };
    for (const ref of project?.references ?? []) {
      const role = ref.role as ReferenceRole;
      map[role] = (map[role] ?? 0) + 1;
    }
    return map;
  }, [project?.references]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch<ProjectDto>(`/projects/${id}`, {
        name: name.trim(),
        description: description.trim(),
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', id] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: () => setError('Could not save project'),
  });

  const addRefMutation = useMutation({
    mutationFn: async (payload: {
      role: ReferenceRole;
      mime: string;
      data: string;
    }) => {
      const { data } = await api.post<ProjectDto>(`/projects/${id}/references`, {
        references: [payload],
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(', ') : message || 'Upload failed');
    },
  });

  const deleteRefMutation = useMutation({
    mutationFn: async (refId: string) => {
      await api.delete(`/projects/${id}/references/${refId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
  });

  const onPick = async (role: ReferenceRole, files: FileList | null) => {
    if (!files?.[0]) return;
    setError(null);
    if (counts[role] >= ROLE_CAPS[role]) {
      setError(`Max ${ROLE_CAPS[role]} ${ROLE_LABELS[role]} reference(s)`);
      return;
    }
    try {
      const draft = await fileToReference(files[0], role);
      addRefMutation.mutate({
        role: draft.role,
        mime: draft.mime,
        data: draft.data,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (isLoading || !project) {
    return <p className="text-sm text-mist">Loading project…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/projects">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
        <Button
          size="sm"
          onClick={() => navigate(`/dashboard/create?projectId=${project.id}`)}
        >
          <Plus className="h-4 w-4" /> New clip in project
        </Button>
      </div>

      <section className="space-y-3 rounded-xl border border-white/10 bg-ink-900/70 p-4">
        <h1 className="font-display text-2xl font-bold text-white">{project.name}</h1>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Series brief</Label>
          <Textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
        >
          Save
        </Button>
      </section>

      <section className="space-y-3 rounded-xl border border-white/10 bg-ink-900/70 p-4">
        <h2 className="text-sm font-semibold text-white">Default references</h2>
        <p className="text-xs text-mist">
          Inherited by new clips unless overridden on create. Protagonist → character,
          scenery → environment, style → look.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {ROLES.map((role) => (
            <div key={role} className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-white">{ROLE_LABELS[role]}</span>
                <span className="text-mist">
                  {counts[role]}/{ROLE_CAPS[role]}
                </span>
              </div>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={counts[role] >= ROLE_CAPS[role] || addRefMutation.isPending}
                onChange={(e) => {
                  void onPick(role, e.target.files);
                  e.target.value = '';
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                {(project.references ?? [])
                  .filter((ref) => ref.role === role)
                  .map((ref) => (
                    <div
                      key={ref.id}
                      className="relative overflow-hidden rounded-lg border border-white/10"
                    >
                      <AuthImage
                        src={ref.url}
                        alt={ref.label || role}
                        className="aspect-square w-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                        onClick={() => deleteRefMutation.mutate(ref.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </section>

      <section className="space-y-2 rounded-xl border border-white/10 bg-ink-900/70 p-4">
        <h2 className="text-sm font-semibold text-white">Series memory</h2>
        {project.memorySummary ? (
          <pre className="whitespace-pre-wrap rounded-lg bg-ink-950/80 p-3 text-xs text-mist">
            {project.memorySummary}
          </pre>
        ) : (
          <p className="text-xs text-mist">
            Completes after each finished clip — keeps the series consistent.
          </p>
        )}
      </section>
    </div>
  );
}
