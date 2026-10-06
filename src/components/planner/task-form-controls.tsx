"use client";

import { useState } from "react";
import { Check, ExternalLink, FolderOpen, Link2, Plus, Tag as TagIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, normalizeUrl } from "@/lib/utils";
import { TASK_COLORS, randomColor, rgba } from "@/lib/colors";
import { PRIORITY_OPTIONS } from "@/lib/priority";
import { addProject, addTag } from "@/lib/store/actions";
import type { Priority, Project, Tag } from "@/types";

/** URL input with a leading link icon and a live "open" button when valid. */
export function LinkField({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  const normalized = normalizeUrl(value);
  const invalid = value.trim() !== "" && normalized === null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={id}
            type="url"
            inputMode="url"
            value={value}
            placeholder="https://exemplo.com"
            aria-invalid={invalid}
            className="pl-8"
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <a
          href={normalized ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!normalized}
          tabIndex={normalized ? 0 : -1}
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition",
            normalized
              ? "hover:bg-accent hover:text-foreground"
              : "pointer-events-none opacity-40",
          )}
          title="Abrir em nova aba"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      {invalid && <p className="text-xs text-destructive">Link inválido.</p>}
    </div>
  );
}

/** Swatch grid for picking an accent color. */
export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TASK_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "grid h-6 w-6 place-items-center rounded-full ring-offset-2 ring-offset-background transition hover:scale-110",
            value === c && "ring-2 ring-ring",
          )}
          style={{ backgroundColor: c }}
          aria-label={`Cor ${c}`}
        >
          {value === c && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

/** Segmented priority selector. Allows clearing when `clearable`. */
export function PrioritySelector({
  value,
  onChange,
  clearable = false,
  compact = false,
}: {
  value: Priority | undefined;
  onChange: (p: Priority | undefined) => void;
  clearable?: boolean;
  compact?: boolean;
}) {
  const btn = (active: boolean) =>
    cn(
      "flex flex-1 items-center justify-center gap-1.5 rounded-lg border font-medium transition",
      compact ? "h-8 px-1.5 text-xs" : "px-2 py-1.5 text-sm",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
    );

  return (
    <div className="flex gap-1.5">
      {clearable && (
        <button type="button" onClick={() => onChange(undefined)} className={btn(value === undefined)}>
          {compact ? "—" : "Nenhuma"}
        </button>
      )}
      {PRIORITY_OPTIONS.map((p) => (
        <button key={p.value} type="button" onClick={() => onChange(p.value)} className={btn(value === p.value)}>
          <span className={cn("h-2.5 w-2.5 rounded-full", p.dot)} />
          {p.label}
        </button>
      ))}
    </div>
  );
}

const NO_PROJECT = "__none__";
const NEW_PROJECT = "__new__";

/** Project picker with inline creation. */
export function ProjectSelect({
  projects,
  value,
  onChange,
  className,
}: {
  projects: Project[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  className?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const active = projects.filter((p) => !p.archived || p.id === value);

  if (creating) {
    const submit = () => {
      const v = name.trim();
      if (v) {
        onChange(addProject(v, randomColor()).id);
      }

      setName("");
      setCreating(false);
    };

    return (
      <Input
        autoFocus
        value={name}
        placeholder="Nome do projeto"
        className={cn("h-8", className)}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }

          if (e.key === "Escape") {
            setCreating(false);
          }
        }}
        onBlur={submit}
      />
    );
  }

  return (
    <Select
      value={value ?? NO_PROJECT}
      onValueChange={(v) => {
        if (v === NEW_PROJECT) {
          setCreating(true);
          return;
        }

        onChange(v === NO_PROJECT ? undefined : (v as string));
      }}
    >
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue>
          {(v: string) => {
            const p = projects.find((x) => x.id === v);
            return p ? (
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <FolderOpen className="h-3.5 w-3.5" /> Sem projeto
              </span>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_PROJECT}>Sem projeto</SelectItem>
        {active.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </span>
          </SelectItem>
        ))}
        <SelectItem value={NEW_PROJECT}>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Plus className="h-3.5 w-3.5" /> Novo projeto…
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * Multi-select tag picker with inline creation. Selected tags render as filled
 * chips; unselected available tags as outline chips; a small input lets the
 * user create a new tag on the fly.
 */
export function TagSelector({
  allTags,
  selected,
  onToggle,
}: {
  allTags: Tag[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");

  const submit = () => {
    const v = label.trim();
    if (v) {
      const tag = addTag(v, randomColor());
      onToggle(tag.id);
    }
    setLabel("");
    setCreating(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allTags.map((t) => {
        const on = selected.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onToggle(t.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none transition",
              on ? "border-transparent" : "border-border text-muted-foreground hover:bg-accent",
            )}
            style={
              on
                ? { backgroundColor: rgba(t.color, 0.16), color: t.color, borderColor: rgba(t.color, 0.4) }
                : undefined
            }
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
            {t.label}
            {on && <Check className="h-2.5 w-2.5" />}
          </button>
        );
      })}

      {creating ? (
        <Input
          autoFocus
          value={label}
          placeholder="Nome da etiqueta"
          className="h-6 w-32 text-xs"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
            if (e.key === "Escape") { setLabel(""); setCreating(false); }
          }}
          onBlur={submit}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium leading-none text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          {allTags.length === 0 ? <TagIcon className="h-2.5 w-2.5" /> : <Plus className="h-2.5 w-2.5" />}
          {allTags.length === 0 ? "Criar etiqueta" : "Nova"}
        </button>
      )}
    </div>
  );
}
