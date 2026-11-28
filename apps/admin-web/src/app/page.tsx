import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Fuel,
  KeyRound,
  MapPin,
  Navigation,
  ShieldCheck,
  Truck,
} from "lucide-react";

const services = [
  {
    name: "Fuel delivery",
    detail: "Emergency fuel brought to your location.",
    icon: Fuel,
    tone: "bg-[#f4ae3e]",
  },
  {
    name: "Towing",
    detail: "A verified tow operator matched to your vehicle.",
    icon: Truck,
    tone: "bg-[#64cf99]",
  },
  {
    name: "Vehicle lockout",
    detail: "Roadside help when your keys cannot get you moving.",
    icon: KeyRound,
    tone: "bg-[#f1d7ff]",
  },
];

export default function PublicHomePage() {
  return (
    <main className="overflow-hidden bg-[#f4f0e7] text-[#191d23]">
      <header className="absolute inset-x-0 top-0 z-30">
        <nav className="mx-auto flex h-24 max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12" aria-label="Primary navigation">
          <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4ae3e]" aria-label="RoadAid home">
            <Image src="/roadaid-mark.svg" alt="" width={46} height={46} priority />
            <span className="text-xl font-black tracking-[-0.03em] text-white">RoadAid</span>
          </Link>
          <div className="hidden items-center gap-8 text-sm font-bold text-white/80 md:flex">
            <a href="#services" className="transition-colors hover:text-white">Services</a>
            <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
            <a href="#providers" className="transition-colors hover:text-white">Drive with us</a>
          </div>
        </nav>
      </header>

      <section className="relative min-h-[780px] bg-[#191d23] text-white lg:min-h-[860px]" aria-labelledby="hero-title">
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -right-[28rem] top-[-34rem] h-[70rem] w-[70rem] rounded-full border-[10rem] border-[#252a32]" />
          <div className="absolute bottom-0 left-[54%] top-0 w-px bg-white/10" />
        </div>
        <div className="relative mx-auto grid min-h-[780px] max-w-[1440px] items-end gap-12 px-5 pb-16 pt-32 sm:px-8 lg:min-h-[860px] lg:grid-cols-[0.9fr_1.1fr] lg:px-12 lg:pb-20">
          <div className="max-w-2xl lg:pb-10">
            <h1 id="hero-title" className="max-w-[760px] text-[clamp(3.8rem,8.3vw,8rem)] font-black leading-[0.86] tracking-[-0.04em] text-balance">
              Roadside help, without the uncertainty.
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-[#d7d9d6] sm:text-xl">
              Request verified fuel delivery, towing or lockout assistance in Abuja. Know who is coming, follow their arrival and stay informed from request to resolution.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a href="#get-app" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-[#f4ae3e] px-7 text-base font-black text-[#191d23] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4ae3e]">
                Get RoadAid <ArrowRight size={19} aria-hidden="true" />
              </a>
              <a href="#providers" className="inline-flex min-h-14 items-center justify-center rounded-xl border border-white/30 px-7 text-base font-black text-white transition-colors hover:border-white hover:bg-white hover:text-[#191d23]">
                Become a provider
              </a>
            </div>
            <a href="#services" className="mt-14 inline-flex items-center gap-3 text-sm font-bold text-white/60 hover:text-white">
              Explore roadside support <ArrowDown size={17} aria-hidden="true" />
            </a>
          </div>

          <div className="relative mx-auto w-full max-w-[680px] self-end" aria-label="Illustration of a RoadAid responder being dispatched to a customer">
            <div className="relative h-[520px] overflow-hidden rounded-[28px] bg-[#2a3038] sm:h-[620px]">
              <div className="absolute inset-0 opacity-30 road-map-lines" />
              <div className="absolute left-[12%] top-[16%] flex items-center gap-3 rounded-xl bg-[#fffdf8] px-4 py-3 text-[#191d23] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#f4ae3e]"><MapPin size={19} /></span>
                <span><strong className="block text-sm">Help requested</strong><small className="text-[#646b70]">Abuja, Nigeria</small></span>
              </div>
              <svg viewBox="0 0 680 620" className="absolute inset-0 h-full w-full" role="img" aria-label="Animated dispatch route">
                <path d="M86 520 C 188 470, 172 340, 318 315 S 440 156, 584 100" fill="none" stroke="#48515c" strokeWidth="34" strokeLinecap="round" />
                <path d="M86 520 C 188 470, 172 340, 318 315 S 440 156, 584 100" fill="none" stroke="#f4ae3e" strokeWidth="7" strokeLinecap="round" strokeDasharray="14 17" className="dispatch-route" />
              </svg>
              <div className="absolute bottom-[12%] left-[7%] grid h-20 w-20 place-items-center rounded-full border-[7px] border-[#fffdf8] bg-[#64cf99] text-[#191d23] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                <Navigation size={30} fill="currentColor" aria-hidden="true" />
              </div>
              <div className="absolute right-[8%] top-[8%] grid h-16 w-16 place-items-center rounded-full border-[6px] border-[#fffdf8] bg-[#f4ae3e] text-[#191d23] shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
                <ShieldCheck size={26} aria-hidden="true" />
              </div>
              <div className="absolute bottom-5 right-5 left-5 flex items-center justify-between gap-4 rounded-2xl bg-[#fffdf8] p-5 text-[#191d23] shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:left-auto sm:w-[390px]">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#747b80]">Responder found</p>
                  <p className="mt-1 truncate text-lg font-black">Verified help is on the way</p>
                  <p className="mt-1 text-sm text-[#646b70]">Identity, vehicle and live arrival status in the app.</p>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#191d23] text-white"><Check size={22} /></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-[1440px] px-5 py-24 sm:px-8 lg:px-12 lg:py-36">
        <div className="grid gap-14 lg:grid-cols-[0.75fr_1.25fr] lg:gap-24">
          <div>
            <h2 className="text-5xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl">Three ways to get moving again.</h2>
            <p className="mt-6 max-w-md text-lg leading-8 text-[#5f666b]">One app for the roadside problems that should not leave you guessing what happens next.</p>
          </div>
          <div className="divide-y divide-[#cfc9bb] border-y border-[#cfc9bb]">
            {services.map(({ name, detail, icon: Icon, tone }) => (
              <article key={name} className="group grid gap-5 py-7 sm:grid-cols-[72px_1fr_auto] sm:items-center">
                <span className={`grid h-14 w-14 place-items-center rounded-2xl ${tone}`}><Icon size={25} aria-hidden="true" /></span>
                <div>
                  <h3 className="text-2xl font-black tracking-[-0.03em]">{name}</h3>
                  <p className="mt-1 text-[#646b70]">{detail}</p>
                </div>
                <ArrowRight className="hidden transition-transform group-hover:translate-x-1 sm:block" aria-hidden="true" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-[#fffdf8]">
        <div className="mx-auto max-w-[1440px] px-5 py-24 sm:px-8 lg:px-12 lg:py-36">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-end">
            <h2 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-[-0.04em] sm:text-7xl">From stranded to supported, step by step.</h2>
            <p className="max-w-xl text-lg leading-8 text-[#5f666b] lg:justify-self-end">RoadAid keeps the journey visible. Dispatch happens in sequence, one eligible provider at a time, until a verified responder accepts.</p>
          </div>
          <div className="mt-16 grid border-y border-[#d8d2c5] md:grid-cols-3 md:divide-x md:divide-[#d8d2c5]">
            {[
              ["Request", "Choose fuel, towing or lockout help and confirm where you are."],
              ["Match", "RoadAid finds an approved provider for the service you need."],
              ["Follow", "See who accepted, track arrival and receive status updates through completion."],
            ].map(([title, copy], index) => (
              <article key={title} className="border-b border-[#d8d2c5] py-9 md:border-b-0 md:px-9 first:md:pl-0 last:md:pr-0">
                <span className="text-sm font-black tabular-nums text-[#a76500]">0{index + 1}</span>
                <h3 className="mt-8 text-3xl font-black tracking-[-0.03em]">{title}</h3>
                <p className="mt-4 max-w-sm leading-7 text-[#646b70]">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="providers" className="bg-[#f4ae3e] text-[#191d23]">
        <div className="mx-auto grid max-w-[1440px] gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-12 lg:py-32">
          <div>
            <h2 className="max-w-4xl text-5xl font-black leading-[0.92] tracking-[-0.04em] sm:text-7xl">Your expertise belongs on the road.</h2>
            <p className="mt-7 max-w-2xl text-lg leading-8">Fuel dispatch riders, tow operators and roadside lockout technicians can register in the RoadAid app, submit their documents and go online after approval.</p>
          </div>
          <div className="self-end border-t-2 border-[#191d23] pt-7">
            {[
              "Choose one service specialty",
              "Complete identity and vehicle verification",
              "Receive one active job at a time",
              "Track earnings and payout requests",
            ].map((item) => <p key={item} className="flex items-center gap-3 border-b border-[#191d23]/30 py-4 font-bold"><Check size={18} />{item}</p>)}
            <a href="#get-app" className="mt-8 inline-flex min-h-14 items-center gap-3 rounded-xl bg-[#191d23] px-7 font-black text-white transition-transform hover:-translate-y-0.5">Register as a provider <ArrowRight size={18} /></a>
          </div>
        </div>
      </section>

      <section id="get-app" className="bg-[#191d23] text-white">
        <div className="mx-auto max-w-[1440px] px-5 py-24 text-center sm:px-8 lg:px-12 lg:py-36">
          <Image src="/roadaid-mark.svg" alt="" width={72} height={72} className="mx-auto" />
          <h2 className="mx-auto mt-8 max-w-4xl text-5xl font-black leading-[0.94] tracking-[-0.04em] sm:text-7xl">Keep certainty within reach.</h2>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#c8ccc9]">RoadAid mobile testing is opening for Android first, with iOS to follow. The same app supports customers and verified providers.</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <span className="inline-flex min-h-14 items-center justify-center rounded-xl bg-[#f4ae3e] px-7 font-black text-[#191d23]">Android testing opens soon</span>
            <span className="inline-flex min-h-14 items-center gap-3 px-7 font-black text-white/75"><MapPin size={18} /> Serving Abuja</span>
          </div>
        </div>
      </section>

      <footer className="bg-[#111418] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <div className="flex items-center gap-3"><Image src="/roadaid-mark.svg" alt="" width={38} height={38} /><div><p className="font-black">RoadAid</p><p className="text-xs font-bold tracking-[0.14em] text-white/50">BUILT FOR CERTAINTY</p></div></div>
          <div className="flex flex-wrap gap-x-7 gap-y-3 text-sm font-bold text-white/65"><a href="#services" className="hover:text-white">Services</a><a href="#providers" className="hover:text-white">Providers</a><span>Abuja, Nigeria</span></div>
        </div>
      </footer>
    </main>
  );
}
