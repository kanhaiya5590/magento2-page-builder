/**
 * Copyright © Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */

import $ from "jquery";
import ko from "knockout";
import $t from "mage/translate";
import "tabs";
import events from "uiEvents";
import _ from "underscore";
import {ActiveOptionsInterface} from "../../binding/active-options.d";
import {PreviewSortableSortUpdateEventParams} from "../../binding/sortable-children";
import {SortableOptionsInterface} from "../../binding/sortable-options.d";
import Config from "../../config";
import ContentTypeConfigInterface from "../../content-type-config.d";
import createContentType from "../../content-type-factory";
import Option from "../../content-type-menu/option";
import OptionInterface from "../../content-type-menu/option.d";
import ContentTypeRemovedParamsInterface from "../../content-type-removed-params.d";
import ContentTypeInterface from "../../content-type.d";
import ContentTypeDuplicateEventParamsInterface from "../content-type-duplicate-event-params";
import ContentTypeMountEventParamsInterface from "../content-type-mount-event-params.d";
import ContentTypeRemovedEventParamsInterface from "../content-type-removed-event-params.d";
import ObservableUpdater from "../observable-updater";
import PreviewCollection from "../preview-collection";

/**
 * @api
 */
export default class Preview extends PreviewCollection {
    public static focusOperationTime: number;
    public focusedTab: KnockoutObservable<number> = ko.observable();
    private disableInteracting: boolean;
    private element: Element;

    /**
     * Assign a debounce and delay to the init of tabs to ensure the DOM has updated
     *
     * @type {(() => void) & _.Cancelable}
     */
    private buildTabs = _.debounce((activeTabIndex = this.previewData.default_active()) => {
        if (this.element && this.element.children.length > 0) {
            try {
                $(this.element).tabs("destroy");
            } catch (e) {
                // We aren't concerned if this fails, tabs throws an Exception when we cannot destroy
            }
            $(this.element).tabs({
                create: (event: Event, ui: JQueryUI.TabsCreateOrLoadUIParams) => {
                    this.setFocusedTab(activeTabIndex || 0);
                },
            });
        }
    }, 10);

    /**
     * @param {ContentTypeInterface} parent
     * @param {ContentTypeConfigInterface} config
     * @param {ObservableUpdater} observableUpdater
     */
    constructor(
        parent: ContentTypeInterface,
        config: ContentTypeConfigInterface,
        observableUpdater: ObservableUpdater,
    ) {
        super(parent, config, observableUpdater);

        events.on("tabs:contentType:afterRender", (args: ContentTypeAfterRenderEventParamsInterface) => {
            if (args.id === this.parent.id && this.element) {
                this.buildTabs();
            }
        });
        events.on("tab-item:contentType:mount", (args: ContentTypeMountEventParamsInterface) => {
            if (this.element && args.contentType.parent.id === this.parent.id) {
                this.refreshTabs();
            }
        });
        // Set the active tab to the new position of the sorted tab
        events.on("tab-item:contentType:removed", (args: ContentTypeRemovedEventParamsInterface) => {
            if (args.parent.id === this.parent.id) {
                this.refreshTabs();

                // We need to wait for the tabs to refresh before executing the focus
                _.defer(() => {
                    const newPosition = args.index > 0 ? args.index - 1 : 0;
                    this.setFocusedTab(newPosition, true);
                });
            }
        });
        // Refresh tab contents and set the focus to the new position of the sorted tab
        events.on("sortableChildren:sortupdate", (args: PreviewSortableSortUpdateEventParams) => {
            if (args.instance.id === this.parent.id) {
                this.refreshTabs(args.newPosition, true);
                /**
                 * Update the default active tab if its position was affected by the sorting
                 */
                const defaultActiveTab = +args.instance.preview.previewData.default_active();
                let newDefaultActiveTab = defaultActiveTab;
                if (args.originalPosition === defaultActiveTab) {
                    newDefaultActiveTab = args.newPosition;
                } else if (args.originalPosition < defaultActiveTab && args.newPosition >= defaultActiveTab) {
                    // a tab was moved from the left of the default active tab the right of it, changing its index
                    newDefaultActiveTab--;
                } else if (args.originalPosition > defaultActiveTab && args.newPosition <= defaultActiveTab) {
                    // a tab was moved from the right of the default active tab the left of it, changing its index
                    newDefaultActiveTab++;
                }
                this.updateData("default_active", newDefaultActiveTab);
            }
        });
    }

    /**
     * Refresh the tabs instance when new content appears
     *
     * @param {number} focusIndex
     * @param {boolean} forceFocus
     * @param {number} activeIndex
     */
    public refreshTabs(focusIndex?: number, forceFocus?: boolean, activeIndex?: number) {
        if (this.element) {
            $(this.element).tabs("refresh");
            if (focusIndex >= 0) {
                this.setFocusedTab(focusIndex, forceFocus);
            } else if (activeIndex) {
                this.setActiveTab(activeIndex);
            }
            // update sortability of tabs
            const sortableElement = $(this.element).find(".tabs-navigation");
            if (sortableElement.hasClass("ui-sortable")) {
                if (this.parent.children().length <= 1) {
                    sortableElement.sortable("disable");
                } else {
                    sortableElement.sortable("enable");
                }
            }
        }
    }

    /**
     * Set the active tab, we maintain a reference to it in an observable for when we rebuild the tab instance
     *
     * @param {number} index
     */
    public setActiveTab(index: number) {
        if (index !== null) {
            $(this.element).tabs("option", "active", index);
        }
    }

    /**
     * Set the focused tab
     *
     * @param {number} index
     * @param {boolean} force
     */
    public setFocusedTab(index: number, force: boolean = false) {
        this.setActiveTab(index);
        if (force) {
            this.focusedTab(null);
        }
        this.focusedTab(index);

        if (this.element && index !== null) {
            if (this.element.getElementsByClassName("tab-name")[index]) {
                (this.element.getElementsByClassName("tab-name")[index] as HTMLElement).focus();
            }
            _.defer(() => {
                if ($(":focus").hasClass("tab-name") && $(":focus").prop("contenteditable")) {
                    document.execCommand("selectAll", false, null);
                }
            });
        }

        /**
         * Record the time the focus operation was completed to ensure the delay doesn't stop interaction when another
         * interaction has started after.
         */
        const focusTime = new Date().getTime();
        Preview.focusOperationTime = focusTime;

        // Add a 200ms delay after a null set to allow for clicks to be captured
        _.delay(() => {
            if (!this.disableInteracting && Preview.focusOperationTime === focusTime) {
                if (index !== null) {
                    events.trigger("interaction:start");
                } else {
                    events.trigger("interaction:stop");
                }
            }
        }, ((index === null) ? 200 : 0));
    }

    /**
     * Return an array of options
     *
     * @returns {Array<OptionInterface>}
     */
    public retrieveOptions(): OptionInterface[] {
        const options = super.retrieveOptions();
        options.push(
            new Option(
                this,
                "add",
                "<i class='icon-pagebuilder-add'></i>",
                $t("Add"),
                this.addTab,
                ["add-child"],
                10,
            ),
        );
        return options;
    }

    /**
     * Add a tab
     */
    public addTab() {
        createContentType(
            Config.getContentTypeConfig("tab-item"),
            this.parent,
            this.parent.stageId,
        ).then((tab) => {
            events.on("tab-item:contentType:mount", (args: ContentTypeMountEventParamsInterface) => {
                if (args.id === tab.id) {
                    this.setFocusedTab(this.parent.children().length - 1);
                    events.off(`tab-item:contentType:mount:${tab.id}`);
                }
            }, `tab-item:contentType:mount:${tab.id}`);
            this.parent.addChild(tab, this.parent.children().length);

            // Update the default tab title when adding a new tab
            tab.dataStore.update(
                $t("Tab") + " " + (this.parent.children.indexOf(tab) + 1),
                "tab_name",
            );
        });
    }

    /**
     * On render init the tabs widget
     *
     * @param {Element} element
     */
    public onContainerRender(element: Element) {
        this.element = element;
        this.buildTabs();
    }

    /**
     * Handle clicking on a tab
     *
     * @param {number} index
     * @param {Event} event
     */
    public onTabClick(index: number, event: Event) {
        // The options menu is within the tab, so don't change the focus if we click an item within
        if ($(event.target).parents(".pagebuilder-options").length > 0) {
            return;
        }
        this.setFocusedTab(index);
    }

    /**
     * Copy over border styles to the tab headers
     *
     * @returns {any}
     */
    public getTabHeaderStyles() {
        const headerStyles = this.data.headers.style();
        return {
            ...headerStyles,
            marginBottom: "-" + headerStyles.borderWidth,
            marginLeft: "-" + headerStyles.borderWidth,
        };
    }

    /**
     * Get the sortable options for the tab heading sorting
     *
     * @returns {JQueryUI.SortableOptions}
     */
    public getSortableOptions(): SortableOptionsInterface {
        const self = this;
        let borderWidth: number;
        return {
            handle: ".tab-drag-handle",
            tolerance: "pointer",
            cursor: "grabbing",
            cursorAt: { left: 8, top: 25 },

            /**
             * Provide custom helper element
             *
             * @param {Event} event
             * @param {JQueryUI.Sortable} element
             * @returns {Element}
             */
            helper(event: Event, element: JQueryUI.Sortable): Element {
                const helper = $(element).clone().css("opacity", "0.7");
                helper[0].querySelector(".pagebuilder-options").remove();
                return helper[0];
            },

            /**
             * Add a padding to the navigation UL to resolve issues of negative margins when sorting
             *
             * @param {Event} event
             * @param {JQueryUI.SortableUIParams} ui
             */
            start(event: Event, ui: JQueryUI.SortableUIParams) {
                /**
                 * Due to the way we use negative margins to overlap the borders we need to apply a padding to the
                 * container when we're moving the first item to ensure the tabs remain in the same place.
                 */
                if (ui.item.index() === 0) {
                    borderWidth = parseInt(ui.item.css("borderWidth"), 10) || 1;
                    $(this).css("paddingLeft", borderWidth);
                }

                ui.helper.css("width", "");
                events.trigger("interaction:start");
                self.disableInteracting = true;
            },

            /**
             * Remove the padding once the operation is completed
             *
             * @param {Event} event
             * @param {JQueryUI.SortableUIParams} ui
             */
            stop(event: Event, ui: JQueryUI.SortableUIParams) {
                $(this).css("paddingLeft", "");
                events.trigger("interaction:stop");
                self.disableInteracting = false;
            },

            placeholder: {
                /**
                 * Provide custom placeholder element
                 *
                 * @param {JQuery<Element>} item
                 * @returns {JQuery<Element>}
                 */
                element(item: JQuery<Element>) {
                    const placeholder = item
                        .clone()
                        .show()
                        .css({
                            display: "inline-block",
                            opacity: "0.3",
                        })
                        .removeClass("focused")
                        .addClass("sortable-placeholder");
                    placeholder[0].querySelector(".pagebuilder-options").remove();
                    return placeholder[0];
                },
                update() {
                    return;
                },
            },
        };
    }

    /**
     * Bind events
     */
    protected bindEvents() {
        super.bindEvents();
        // ContentType being mounted onto container

        events.on("tabs:contentType:dropped:create", (args: ContentTypeDroppedCreateEventParamsInterface) => {
            if (args.id === this.parent.id && this.parent.children().length === 0) {
                this.addTab();
            }
        });
        // ContentType being removed from container
        events.on("tab-item:contentType:removed", (args: ContentTypeRemovedParamsInterface) => {
            if (args.parent.id === this.parent.id) {
                // Mark the previous tab as active
                const newIndex = (args.index - 1 >= 0 ? args.index - 1 : 0);
                this.refreshTabs(newIndex, true);
            }
        });
        // Capture when a content type is duplicated within the container
        let duplicatedTab: ContentTypeInterface;
        let duplicatedTabIndex: number;
        events.on("tab-item:contentType:duplicate", (args: ContentTypeDuplicateEventParamsInterface) => {
            if (this.parent.id === args.duplicateContentType.parent.id) {
                const tabData = args.duplicateContentType.dataStore.get(args.duplicateContentType.id);
                args.duplicateContentType.dataStore.update(
                    tabData.tab_name.toString() + " copy",
                    "tab_name",
                );
                duplicatedTab = args.duplicateContentType;
                duplicatedTabIndex = args.index;
            }
            this.buildTabs(args.index);
        });
        events.on("tab-item:contentType:mount", (args: ContentTypeMountEventParamsInterface) => {
            if (duplicatedTab && args.id === duplicatedTab.id) {
                this.refreshTabs(duplicatedTabIndex, true);
                duplicatedTab = duplicatedTabIndex = null;
            }
            if (this.parent.id === args.contentType.parent.id) {
                this.updateTabNamesInDataStore();
                args.contentType.dataStore.subscribe(() => {
                    this.updateTabNamesInDataStore();
                });
            }
        });
    }

    /**
     * Update data store with active options
     */
    private updateTabNamesInDataStore() {
        const activeOptions: ActiveOptionsInterface[] = [];
        this.parent.children().forEach((tab: ContentTypeInterface, index: number) => {
            const tabData = tab.dataStore.get();
            activeOptions.push({
                label: tabData.tab_name.toString(),
                labeltitle: tabData.tab_name.toString(),
                value: index,
            });
        });

        this.parent.dataStore.update(
            activeOptions,
            "_default_active_options",
        );
    }
}

// Resolve issue with jQuery UI tabs content typeing events on content editable areas
const originalTabKeyDown = $.ui.tabs.prototype._tabKeydown;
$.ui.tabs.prototype._tabKeydown = function(event: Event) {
    // If the target is content editable don't handle any events
    if ($(event.target).attr("contenteditable")) {
        return;
    }
    originalTabKeyDown.call(this, event);
};
