import { Compass } from "lucide-react";
import Link from "next/link";
import { getI18n } from "@/lib/locale";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-sage text-moss">
          <Compass size={22} aria-hidden />
        </span>
        <h1 className="h-page mt-5">{t.common.notFoundTitle}</h1>
        <p className="mt-2 text-mute">{t.common.notFoundBody}</p>
        <Link href="/" className="btn btn-primary mt-6">
          {t.common.backHome}
        </Link>
      </div>
    </div>
  );
}
