import Image from "next/image";

import type { Image as Cms0Image } from "@cms0/cms0/custom-types";

type CmsImageProps = {
  image?: Cms0Image;
  alt: string;
  className?: string;
  priority?: boolean;
};

export function CmsImage({
  image,
  alt,
  className = "",
  priority = false,
}: CmsImageProps) {
  const label = image?.alt || alt;

  if (image?.url) {
    return (
      <div className={`relative overflow-hidden bg-neutral-200 ${className}`}>
        <Image
          alt={label}
          className="object-cover"
          fill
          priority={priority}
          sizes="(min-width: 1024px) 45vw, 100vw"
          src={image.url}
        />
      </div>
    );
  }

  return (
    <div
      aria-label={label}
      className={`relative overflow-hidden bg-[linear-gradient(135deg,#d9b15d_0%,#c65f3c_32%,#2f5b72_67%,#4f6f52_100%)] ${className}`}
      role="img"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.48),transparent_24%),radial-gradient(circle_at_74%_70%,rgba(255,255,255,0.2),transparent_26%)]" />
      <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/35 bg-white/20 p-4 text-sm font-medium text-white backdrop-blur">
        Placeholder artwork
      </div>
    </div>
  );
}
