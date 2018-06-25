/**
 * Copyright © Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */

/**
 * @api
 */
export default interface ObservableObject {
    [key: string]: KnockoutObservable<any>;
}
