import { describe, expect, it } from "vitest";
import { chunkMessage, WHATSAPP_TEXT_MAX } from "./whatsapp-send";

describe("chunkMessage", () => {
  it("returns empty array for empty / whitespace input", () => {
    expect(chunkMessage("")).toEqual([]);
    expect(chunkMessage("   \n  \t  ")).toEqual([]);
  });

  it("returns a single block when text fits in the limit", () => {
    const text = "Olá, esta é uma mensagem curta.";
    expect(chunkMessage(text)).toEqual([text]);
  });

  it("honors explicit --- separator as block boundary", () => {
    const text = "Primeiro bloco com tudo.\n---\nSegundo bloco aqui.\n---\nTerceiro bloco.";
    const blocks = chunkMessage(text);
    expect(blocks).toEqual([
      "Primeiro bloco com tudo.",
      "Segundo bloco aqui.",
      "Terceiro bloco.",
    ]);
  });

  it("ignores empty segments produced by consecutive separators", () => {
    const text = "Bloco A\n---\n\n---\nBloco B";
    expect(chunkMessage(text)).toEqual(["Bloco A", "Bloco B"]);
  });

  it("splits oversized text into chunks all within max", () => {
    const long = "abcdefghij ".repeat(600); // ~6600 chars
    const blocks = chunkMessage(long, 100);
    for (const b of blocks) {
      expect(b.length).toBeLessThanOrEqual(100);
      expect(b.length).toBeGreaterThan(0);
    }
    expect(blocks.length).toBeGreaterThan(1);
  });

  it("preserves character order when chunking long text", () => {
    const long = "abcdefghij ".repeat(600);
    const blocks = chunkMessage(long, 100);
    const reassembled = blocks.join(" ").replace(/\s+/g, " ").trim();
    const original = long.replace(/\s+/g, " ").trim();
    expect(reassembled).toBe(original);
  });

  it("respects WHATSAPP_TEXT_MAX by default", () => {
    const long = "x".repeat(WHATSAPP_TEXT_MAX * 3 + 17);
    const blocks = chunkMessage(long);
    for (const b of blocks) {
      expect(b.length).toBeLessThanOrEqual(WHATSAPP_TEXT_MAX);
    }
    expect(blocks.length).toBeGreaterThanOrEqual(3);
  });

  it("never produces empty chunks", () => {
    const long = "lorem ipsum ".repeat(2000);
    const blocks = chunkMessage(long, 50);
    for (const b of blocks) {
      expect(b.trim().length).toBeGreaterThan(0);
    }
  });

  it("combines explicit separators with oversized segments", () => {
    const seg1 = "A".repeat(50);
    const seg2 = "B".repeat(250);
    const text = `${seg1}\n---\n${seg2}`;
    const blocks = chunkMessage(text, 100);
    expect(blocks[0]).toBe(seg1);
    // seg2 deve ter sido dividido em múltiplos sub-blocos
    expect(blocks.length).toBeGreaterThan(2);
    expect(blocks.slice(1).join("")).toBe(seg2);
  });
});
