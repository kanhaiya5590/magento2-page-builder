<?php
/**
 * Copyright © Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */
declare(strict_types=1);

namespace Magento\PageBuilder\Model\Dom;

use Gt\Dom\XMLDocument as GtDomXMLDocument;
use Magento\Framework\ObjectManagerInterface;
use Magento\PageBuilder\Model\Dom\Adapter\XmlDocumentInterface;

/**
 * PhpGt DOM XmlDocument wrapper.
 */
class XmlDocument implements XmlDocumentInterface
{
    /**
     * @var ObjectManagerInterface
     */
    private $objectManager;

    /**
     * @var GtDomXMLDocument
     */
    private $document;

    /**
     * HtmlDocument constructor.
     * @param ObjectManagerInterface $objectManager
     * @param GtDomXMLDocument $document
     */
    public function __construct(
        ObjectManagerInterface $objectManager,
        GtDomXMLDocument $document
    ) {
        $this->objectManager = $objectManager;
        $this->document = $document;
    }

}
