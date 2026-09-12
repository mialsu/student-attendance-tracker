import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types/breadcrumb';

interface BreadcrumbsProps {
  items: BreadcrumbItemType[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    // Visible at every width since slice 3. It was `hidden md:flex` while it sat in the header
    // beside the brand, where there was no room for it on a phone; at the top of the main region
    // there is, and it is now the only thing naming which tab of a Kurssi you are on — the
    // sidebar marks the Kurssi, not the tab. `BreadcrumbList` already wraps, so 320px costs
    // vertical space rather than a sideways scroll (`A11Y-7`).
    <Breadcrumb className="mb-5">
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={index}>
              <BreadcrumbItem>
                {isLast || !item.href ? (
                  <BreadcrumbPage className="max-w-[200px] truncate">
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.href} className="max-w-[200px] truncate">
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
