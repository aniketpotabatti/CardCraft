import { Heart, MessageCircle, MoreHorizontal, Send, Signal, Wifi } from "lucide-react";
import { activeSlide, useEditorStore } from "../../model/store";
import { SlidePreview } from "../panels/SlidePreview";

export type MockupKind = "feed" | "story" | "device";

export function MockupPreview({ kind }: { kind: MockupKind }) {
  const slide = useEditorStore((state) => activeSlide(state));
  if (!slide) return null;
  const content = <SlidePreview slide={slide} className="size-full" style={{ aspectRatio: `${slide.width} / ${slide.height}` }} />;

  if (kind === "feed") return <div className="grid h-full place-items-center overflow-auto bg-[#e7e8eb] p-8">
    <article className="w-[min(390px,90%)] overflow-hidden rounded-xl border border-black/10 bg-white text-[#262626] shadow-2xl">
      <header className="flex items-center gap-2.5 px-3 py-3"><div className="size-8 rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-600 p-0.5"><div className="size-full rounded-full border-2 border-white bg-zinc-200" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">yourbrand</p><p className="text-[9px] text-zinc-500">Sponsored · Original audio</p></div><MoreHorizontal className="size-4" /></header>
      <div className="w-full bg-zinc-100" style={{ aspectRatio: `${slide.width} / ${slide.height}` }}>{content}</div>
      <div className="flex items-center gap-3 px-3 py-2.5"><Heart className="size-5" /><MessageCircle className="size-5" /><Send className="size-5" /><span className="ml-auto text-[10px]">•••</span></div>
      <div className="px-3 pb-3 text-[10px]"><span className="font-semibold">yourbrand</span> Your next great idea starts here.<div className="mt-1 text-zinc-400">View all 24 comments</div></div>
    </article>
  </div>;

  if (kind === "story") return <div className="grid h-full place-items-center overflow-auto bg-gradient-to-br from-[#ece9e4] to-[#c8c4be] p-6">
    <div className="relative w-[min(340px,80%)] overflow-hidden rounded-[2.4rem] border-[10px] border-[#171717] bg-black p-1 shadow-2xl" style={{ aspectRatio: "9 / 19.5" }}>
      <div className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
      <div className="absolute inset-x-4 top-4 z-10 flex gap-1">{[0, 1, 2, 3].map((index) => <span key={index} className="h-0.5 flex-1 rounded bg-white/45"><i className={`block h-full rounded bg-white ${index === 0 ? "w-2/3" : index < 2 ? "w-full" : "w-0"}`} /></span>)}</div>
      <div className="absolute inset-1 overflow-hidden rounded-[1.8rem] bg-black pt-7">{content}</div>
      <div className="absolute inset-x-4 bottom-3 z-10 flex h-9 items-center rounded-full border border-white/70 px-3 text-[10px] text-white">Reply to story…<Heart className="ml-auto size-4" /></div>
    </div>
  </div>;

  return <div className="grid h-full place-items-center overflow-auto bg-[#d9dade] p-8">
    <div className="relative w-[min(380px,85%)] rounded-[3rem] border-[10px] border-[#141414] bg-black p-2 shadow-2xl" style={{ aspectRatio: "9 / 19.5" }}>
      <div className="absolute left-1/2 top-2.5 z-10 flex h-5 w-[34%] -translate-x-1/2 items-center justify-end rounded-full bg-black px-2"><span className="mr-1 size-1.5 rounded-full bg-[#253040]" /></div>
      <div className="absolute inset-2 overflow-hidden rounded-[2.35rem] bg-white">
        <div className="flex h-full flex-col">
          <div className="flex h-10 items-center justify-between px-6 pt-2 text-[9px] font-semibold text-black"><span>9:41</span><span className="flex items-center gap-1"><Signal className="size-3" /><Wifi className="size-3" /></span></div>
          <div className="min-h-0 flex-1 bg-zinc-100">{content}</div>
          <div className="h-5 bg-white"><div className="mx-auto mt-2 h-1 w-24 rounded-full bg-black" /></div>
        </div>
      </div>
    </div>
  </div>;
}
