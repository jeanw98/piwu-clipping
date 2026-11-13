import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Plus, Trash2 } from 'lucide-react';
import type { ProjectDto } from '@piwu/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get<ProjectDto[]>('/projects');
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ProjectDto>('/projects', {
        name: name.trim(),
        description: description.trim(),
      });
      return data;
    },
    onSuccess: () => {
      setName('');
      setDescription('');
      setShowForm(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(', ') : message || 'Could not create project');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/projects/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Projects
          </h1>
          <p className="mt-1 text-sm text-mist">
            Series memory, shared protagonist/scenery/style refs, and asset cache.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" /> New project
        </Button>
      </section>

      {showForm ? (
        <form
          className="space-y-3 rounded-xl border border-white/10 bg-ink-900/70 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PIWU product series"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-description">
              What is this project? (series brief)
            </Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Same host, modern kitchen, educational money tips for LatAm — keep look and tone consistent across clips."
              required
              minLength={10}
            />
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <Button type="submit" size="sm" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create project'}
          </Button>
        </form>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-mist">Loading projects…</p>
      ) : !projects?.length ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-ink-900/50 px-6 py-10 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-mist" />
          <p className="mt-3 font-display text-lg text-white">No projects yet</p>
          <p className="mt-1 text-sm text-mist">
            Create one to lock protagonist, scenery, and series memory across clips.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="rounded-xl border border-white/10 bg-ink-900/70 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    to={`/dashboard/projects/${project.id}`}
                    className="font-display text-lg font-semibold text-white hover:text-accent"
                  >
                    {project.name}
                  </Link>
                  <p className="mt-1 line-clamp-3 text-xs text-mist">
                    {project.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 px-0"
                  onClick={() => deleteMutation.mutate(project.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-mist">
                <span>{project.clipCount ?? 0} clips</span>
                <span>·</span>
                <span>{project.references?.length ?? 0} refs</span>
                {project.memorySummary ? (
                  <>
                    <span>·</span>
                    <span>memory on</span>
                  </>
                ) : null}
              </div>
              <Button asChild size="sm" variant="secondary" className="mt-3">
                <Link to={`/dashboard/projects/${project.id}`}>Open</Link>
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
