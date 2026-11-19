"use client";

import { Check, KeyRound, Loader2, PlugZap, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { removeAiKeyAction, saveAiKeyAction, saveOpenRouterVisionKeyAction, testAiAction, type KeyState } from "@/app/actions-tools";

type ProviderOpt = { id: string; label: string; defaultModel: string };
type Current = { id: string; label: string; model: string; masked: string; source: "env" | "settings" } | null;

export function AiKeyForm({ providers, current, visionMasked }: { providers: ProviderOpt[]; current: Current; visionMasked: string }) {
  const [provider, setProvider] = useState(current?.id ?? (providers.find((p) => p.id === "gemini") ?? providers[0]).id);
  const [state, action, saving] = useActionState<KeyState, FormData>(saveAiKeyAction, {});
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [removing, startRemove] = useTransition();
  const keyRef = useRef<HTMLInputElement>(null);
  const fromEnv = current?.source === "env";
  const selected = providers.find((p) => p.id === provider) ?? providers[0];

  useEffect(() => {
    if (state.ok && keyRef.current) keyRef.current.value = "";
  }, [state]);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await testAiAction());
    } catch {
      setTest({ ok: false, message: "The test request could not be sent." });
    }
    setTesting(false);
  };

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="ai-key">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ai-key" className="h-section">AI provider</h2>
        {current ? (
          <span className={`pill !h-8 !px-3 ${test?.ok ? "pill-ok" : "pill-mute"}`}>
            {test?.ok && <Check size={14} aria-hidden />}
            {test?.ok ? "Connected" : "Key saved, not tested yet"} · {current.label} · {current.model}
          </span>
        ) : (
          <span className="pill pill-warn !h-8 !px-3">Not connected</span>
        )}
      </div>

      {current && (
        <p className="mt-3 text-sm text-mute">
          Key <span className="num text-ink">{current.masked}</span> {fromEnv ? "comes from an environment variable and is managed outside this page." : "is saved in this workspace."}
        </p>
      )}

      {!fromEnv && (
        <form action={action} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ai-provider">Provider</label>
            <select id="ai-provider" name="provider" className="field" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ai-model">Model (optional)</label>
            <input id="ai-model" name="model" className="field" defaultValue={current?.source === "settings" && current.id === provider ? current.model : ""} placeholder={selected.defaultModel} maxLength={80} autoComplete="off" spellCheck={false} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ai-key-input">API key</label>
            <input
              ref={keyRef}
              id="ai-key-input"
              name="key"
              type="password"
              className="field"
              placeholder={current ? `Saved: ${current.masked}. Paste a new key to replace it.` : "Paste the key from your provider's console"}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(state.error)}
              aria-describedby="ai-key-help"
            />
            <p id="ai-key-help" className="mt-1.5 text-[13px] leading-relaxed text-mute">
              Create a key in Anthropic, OpenAI, Google AI Studio, Groq or OpenRouter. OpenRouter supports compatible text models and Recraft free image generation; model access and free-tier limits depend on your OpenRouter account. Leave the model empty to use {selected.defaultModel}; if your provider rejects that
              name, type the model your account offers.
            </p>
            {state.error && <p role="alert" className="mt-1.5 text-[13px] text-danger">{state.error}</p>}
            {state.ok && <p role="status" className="mt-1.5 text-[13px] text-forest">Saved. Run the test to confirm the key works.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <KeyRound size={16} aria-hidden />}
              Save key
            </button>
            {current && (
              <button type="button" className="btn btn-ghost" disabled={removing} onClick={() => window.confirm("Remove the saved API key?") && startRemove(() => removeAiKeyAction())}>
                <Trash2 size={15} aria-hidden />
                Remove key
              </button>
            )}
          </div>
        </form>
      )}

      <div className="mt-5 border-t border-line pt-5">
        <h3 className="text-sm font-semibold text-ink">OpenRouter image analysis (Nemotron Vision)</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-mute">
          Optional separate OpenRouter key used only to inspect the uploaded product photo and describe its visible packaging before image editing. It does not generate or edit images.
          {visionMasked ? <> Saved key: <span className="num text-ink">{visionMasked}</span>.</> : " No analysis key saved yet."}
        </p>
        <form action={saveOpenRouterVisionKeyAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input name="openrouterVisionKey" type="password" className="field min-w-0 flex-1" placeholder={visionMasked ? "Paste a new key to replace it" : "Paste OpenRouter API key"} autoComplete="off" spellCheck={false} />
          <button type="submit" className="btn btn-secondary">Save analysis key</button>
        </form>
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <button type="button" className="btn btn-ghost" onClick={runTest} disabled={testing || !current}>
          {testing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <PlugZap size={16} aria-hidden />}
          {testing ? "Testing…" : "Test connection"}
        </button>
        <p className="mt-2 text-[13px] text-mute">Sends one short request to the provider and shows exactly what comes back.</p>
        <div role="status" aria-live="polite">
          {test && (
            <p className={`mt-3 flex gap-2.5 rounded-xl px-4 py-3 text-sm ${test.ok ? "bg-lime-soft text-forest" : "bg-danger-soft text-danger"}`}>
              {test.ok ? <Check size={16} aria-hidden className="mt-0.5 shrink-0" /> : <X size={16} aria-hidden className="mt-0.5 shrink-0" />}
              <span className="min-w-0 break-words">{test.message}</span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
