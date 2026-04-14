import { Fragment, type ReactNode } from 'react';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { cn } from '../../lib/utils';

interface AppTabRenderState {
  selected: boolean;
  disabled: boolean;
}

interface AppTabItem<TKey extends string> {
  key: TKey;
  tab: ReactNode | ((state: AppTabRenderState) => ReactNode);
  panel: ReactNode;
  disabled?: boolean;
  tabId?: string;
  panelId?: string;
  tabClassName?: string | ((state: AppTabRenderState) => string);
  panelClassName?: string;
}

interface AppTabsProps<TKey extends string> {
  items: AppTabItem<TKey>[];
  selectedKey: TKey;
  onChange: (key: TKey) => void;
  className?: string;
  listClassName?: string;
  panelsClassName?: string;
  defaultPanelClassName?: string;
}

export const AppTabs = <TKey extends string>({
  items,
  selectedKey,
  onChange,
  className,
  listClassName,
  panelsClassName,
  defaultPanelClassName,
}: AppTabsProps<TKey>) => {
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.key === selectedKey),
  );

  return (
    <TabGroup
      selectedIndex={selectedIndex}
      onChange={(nextIndex) => {
        const nextItem = items[nextIndex];
        if (nextItem) {
          onChange(nextItem.key);
        }
      }}
      className={className}
    >
      <TabList className={listClassName}>
        {items.map((item) => {
          const tabProps = item.tabId ? ({ id: item.tabId } as Record<string, string>) : {};

          return (
            <Tab key={item.key} as={Fragment} disabled={item.disabled} {...tabProps}>
              {({ selected, disabled }) => {
                const state = { selected, disabled };

                return (
                  <button
                    className={cn(
                      typeof item.tabClassName === 'function'
                        ? item.tabClassName(state)
                        : item.tabClassName,
                    )}
                  >
                    {typeof item.tab === 'function' ? item.tab(state) : item.tab}
                  </button>
                );
              }}
            </Tab>
          );
        })}
      </TabList>

      <TabPanels className={panelsClassName}>
        {items.map((item) => (
          <TabPanel
            key={item.key}
            id={item.panelId}
            className={cn(defaultPanelClassName, item.panelClassName)}
            unmount={false}
          >
            {item.panel}
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
};

export type { AppTabItem, AppTabRenderState };
