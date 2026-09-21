import { categoryEmoji, isCategoryImage } from './categoryEmoji';

export default function CategoryIconVisual({ icon, name }: { icon: string; name?: string }) {
  const visual = categoryEmoji(icon, name);
  if (isCategoryImage(visual)) return <img className="category-custom-icon" src={visual} alt="" aria-hidden="true"/>;
  return <>{visual}</>;
}
