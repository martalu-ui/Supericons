// This plugin creates a component with size variants from a selected icon

// Helper function to apply stroke to vector nodes only
// Only modifies existing strokes, does NOT add strokes to nodes that don't have them
function applyStrokeToVectors(node, strokeWeight) {
  if (!strokeWeight || strokeWeight <= 0) {
    return; // Don't apply if weight is invalid
  }
  
  // Check if this is a vector node that can have strokes
  const vectorNodeTypes = ['VECTOR', 'LINE', 'ELLIPSE', 'RECTANGLE', 'POLYGON', 'STAR', 'BOOLEAN_OPERATION'];
  
  if (vectorNodeTypes.includes(node.type)) {
    try {
      // Only modify existing strokes, don't add new ones
      if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
        // Only update stroke weight if the node already has a stroke
        if ('strokeWeight' in node) {
          node.strokeWeight = strokeWeight;
        }
      }
      // If node doesn't have stroke, don't add one - leave it as is
    } catch (e) {
      console.error('Error applying stroke to node:', e);
    }
  }
  
  // Recursively apply to children
  if ('children' in node && Array.isArray(node.children)) {
    node.children.forEach(child => {
      applyStrokeToVectors(child, strokeWeight);
    });
  }
}

// Helper function to convert all strokes to outline in a node and its children
function convertStrokesToOutline(node) {
  const vectorNodeTypes = ['VECTOR', 'LINE', 'ELLIPSE', 'RECTANGLE', 'POLYGON', 'STAR', 'BOOLEAN_OPERATION'];
  
  // Collect all nodes with strokes first
  const nodesToVectorize = [];
  
  function collectNodesWithStrokes(n) {
    if (vectorNodeTypes.includes(n.type)) {
      if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length > 0) {
        if ('strokeWeight' in n && n.strokeWeight > 0) {
          nodesToVectorize.push(n);
        }
      }
    }
    
    // Recursively collect from children
    if ('children' in n && Array.isArray(n.children)) {
      n.children.forEach(child => {
        collectNodesWithStrokes(child);
      });
    }
  }
  
  collectNodesWithStrokes(node);
  
  console.log(`Found ${nodesToVectorize.length} nodes with strokes to convert`);
  
  // Now vectorize all collected nodes
  // Note: vectorizeStrokes() converts stroke to filled vector paths
  // This is equivalent to "Outline Stroke" in Figma UI
  if (nodesToVectorize.length > 0) {
    // Select all nodes with strokes
    const originalSelection = [...figma.currentPage.selection];
    
    try {
      figma.currentPage.selection = nodesToVectorize;
      
      // Try to use vectorizeStrokes on each node
      // Process in reverse order to avoid index issues
      for (let i = nodesToVectorize.length - 1; i >= 0; i--) {
        const n = nodesToVectorize[i];
        try {
          // vectorizeStrokes() should be available on vector nodes with strokes
          // This converts the stroke into a filled vector shape (outline stroke)
          // Check multiple ways the method might be available
          let vectorized = false;
          
          // Method 1: Direct method call
          if (typeof n.vectorizeStrokes === 'function') {
            n.vectorizeStrokes();
            vectorized = true;
            console.log('✓ Vectorized strokes (direct) for:', n.type, n.name || 'unnamed');
          }
          // Method 2: Check if it's a property that's a function
          else if (n.vectorizeStrokes && typeof n.vectorizeStrokes === 'function') {
            n.vectorizeStrokes();
            vectorized = true;
            console.log('✓ Vectorized strokes (property) for:', n.type, n.name || 'unnamed');
          }
          // Method 3: Try via prototype
          else {
            const proto = Object.getPrototypeOf(n);
            if (proto && typeof proto.vectorizeStrokes === 'function') {
              proto.vectorizeStrokes.call(n);
              vectorized = true;
              console.log('✓ Vectorized strokes (prototype) for:', n.type, n.name || 'unnamed');
            }
          }
          
          if (!vectorized) {
            console.warn('⚠ vectorizeStrokes method not available on node type:', n.type);
            // Log node properties for debugging
            const props = Object.getOwnPropertyNames(n).filter(p => p.toLowerCase().includes('stroke') || p.toLowerCase().includes('vector'));
            if (props.length > 0) {
              console.log('  Available stroke/vector properties:', props);
            }
          }
        } catch (e) {
          console.error('❌ Error vectorizing strokes for node:', e);
          console.error('  Node type:', n.type, 'Node name:', n.name || 'unnamed');
        }
      }
      
      // Restore original selection
      figma.currentPage.selection = originalSelection;
    } catch (e) {
      console.error('Error during vectorization process:', e);
      // Restore original selection on error
      try {
        figma.currentPage.selection = originalSelection;
      } catch (restoreError) {
        console.error('Error restoring selection:', restoreError);
      }
    }
  }
  
  console.log(`Completed converting ${nodesToVectorize.length} nodes with strokes to outline`);
}


figma.showUI(__html__, { width: 400, height: 600 });

// Load and send saved configuration to UI on startup
(async () => {
  try {
    const savedConfig = await figma.clientStorage.getAsync('supericons-config');
    if (savedConfig) {
      figma.ui.postMessage({
        type: 'load-config',
        config: savedConfig
      });
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
})();

// Check if there's a selection when plugin opens
if (figma.currentPage.selection.length > 0) {
  const selection = figma.currentPage.selection[0];
  figma.ui.postMessage({ 
    type: 'selection-changed', 
    hasSelection: true,
    selectionName: selection.name
  });
}

// Listen for selection changes
figma.on('selectionchange', () => {
  if (figma.currentPage.selection.length > 0) {
    const selection = figma.currentPage.selection[0];
    figma.ui.postMessage({ 
      type: 'selection-changed', 
      hasSelection: true,
      selectionName: selection.name
    });
  } else {
    figma.ui.postMessage({ 
      type: 'selection-changed', 
      hasSelection: false
    });
  }
});

figma.ui.onmessage = async (msg) => {
  // Save configuration
  if (msg.type === 'save-config') {
    try {
      await figma.clientStorage.setAsync('supericons-config', msg.config);
    } catch (e) {
      console.error('Error saving config:', e);
    }
    return;
  }
  
  // Request saved configuration
  if (msg.type === 'request-config') {
    try {
      const savedConfig = await figma.clientStorage.getAsync('supericons-config');
      figma.ui.postMessage({
        type: 'load-config',
        config: savedConfig || null
      });
    } catch (e) {
      console.error('Error loading config:', e);
      figma.ui.postMessage({
        type: 'load-config',
        config: null
      });
    }
    return;
  }
  
  if (msg.type === 'create-component') {
    try {
      const variants = msg.variants;
      const strokeEnabled = msg.strokeEnabled || false;
      const outlineFlattenEnabled = msg.outlineFlattenEnabled || false;
      let componentName = (msg.componentName || 'Icon Component').trim();
      let propertyName = (msg.propertyName || 'Size').trim();
      
      // Validate inputs
      if (!propertyName) {
        figma.notify('Property name cannot be empty');
        return;
      }
      
      // Normalize names - ensure they're valid for Figma's naming convention
      // Component and property names can have spaces, but we'll keep them as-is
      // since Figma supports spaces in variant property names
      componentName = componentName.trim();
      propertyName = propertyName.trim();
      
      if (!variants || variants.length === 0) {
        figma.notify('Please add at least one variant');
        return;
      }
      
      // Check if there's a selection
      if (figma.currentPage.selection.length === 0) {
        figma.notify('Please select at least one icon');
        return;
      }
      
      const selectedNodes = figma.currentPage.selection;
      
      // Process each selected icon
      selectedNodes.forEach((selectedNode, nodeIndex) => {
        try {
          // Step 1: Get original dimensions from selected node (don't clone yet to avoid duplication)
      const originalWidth = selectedNode.width;
      const originalHeight = selectedNode.height;
      const originalSize = Math.max(originalWidth, originalHeight);
      
      // Calculate original content bounds to preserve padding
      function getContentBounds(node) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        if (node.type === 'FRAME' || node.type === 'GROUP') {
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
              try {
                const bounds = getContentBounds(child);
                if (bounds.minX !== Infinity) {
                  minX = Math.min(minX, bounds.minX);
                  minY = Math.min(minY, bounds.minY);
                  maxX = Math.max(maxX, bounds.maxX);
                  maxY = Math.max(maxY, bounds.maxY);
                }
              } catch (e) {
                // Skip if error
              }
            });
          }
        } else {
          try {
            const x = node.x || 0;
            const y = node.y || 0;
            const width = node.width || 0;
            const height = node.height || 0;
            minX = x;
            minY = y;
            maxX = x + width;
            maxY = y + height;
          } catch (e) {
            // Skip if error
          }
        }
        
        return { minX, minY, maxX, maxY };
      }
      
      // Calculate original padding (space around content) from selected node
      const originalContentBounds = getContentBounds(selectedNode);
      
      // Step 2: Create variant components from the selected icon
      const variantComponents = [];
      
      variants.forEach((variant) => {
        // Step 1: Duplicate the frame that Figma marks
        const variantIconClone = selectedNode.clone();
        
        // Step 2: Use the frame directly (we'll convert it to component later if needed)
        // For now, we'll work with the frame as-is
        let variantComponent;
        
        // Get original dimensions
        const originalContentWidth = originalContentBounds.maxX - originalContentBounds.minX;
        const originalContentHeight = originalContentBounds.maxY - originalContentBounds.minY;
        const originalContentSize = Math.max(originalContentWidth, originalContentHeight);
        
        // Calculate scale factor
        const scaleFactor = variant.size / originalSize;
        console.log(`📐 Scale factor: ${scaleFactor.toFixed(3)} (${originalSize} -> ${variant.size})`);
        
        // Resize the duplicated frame to target size
        // Figma will automatically scale the content proportionally
        try {
          variantIconClone.resize(variant.size, variant.size);
          console.log(`✓ Resized duplicated frame to ${variantIconClone.width}x${variantIconClone.height}`);
        } catch (e) {
          console.error('Error resizing clone:', e);
          figma.notify('Error resizing icon', { timeout: 2000 });
        }
        
        // Apply stroke only if stroke is enabled AND variant has stroke value
        // This will modify the stroke of vector nodes inside the icon
        if (strokeEnabled && variant.stroke && variant.stroke > 0 && !isNaN(variant.stroke)) {
          try {
            applyStrokeToVectors(variantIconClone, variant.stroke);
            console.log(`✓ Applied stroke ${variant.stroke} to variant`);
          } catch (e) {
            console.error('Error applying stroke:', e);
            // Continue even if stroke application fails
          }
        } else {
          // Don't touch stroke if not enabled
          console.log('✓ Stroke not applied (stroke disabled or no stroke value)');
        }
        
        // Convert to outline stroke and flatten if enabled
        if (outlineFlattenEnabled) {
          console.log('🔄 Starting outline stroke conversion and flattening...');
          
          // Step 1: Convert all strokes to outline using outlineStroke()
          // outlineStroke() returns a new node with stroke converted to outline
          const vectorNodeTypes = ['VECTOR', 'LINE', 'ELLIPSE', 'RECTANGLE', 'POLYGON', 'STAR', 'BOOLEAN_OPERATION'];
          const nodesToReplace = [];
          
          // First, collect all nodes with strokes that need to be converted
          function collectNodesWithStrokes(node) {
            if (vectorNodeTypes.includes(node.type)) {
              if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
                if ('strokeWeight' in node && node.strokeWeight > 0) {
                  nodesToReplace.push(node);
                }
              }
            }
            
            if ('children' in node && Array.isArray(node.children)) {
              node.children.forEach(child => {
                collectNodesWithStrokes(child);
              });
            }
          }
          
          collectNodesWithStrokes(variantIconClone);
          console.log(`📊 Found ${nodesToReplace.length} nodes with strokes to convert`);
          
          // Convert each node's stroke to outline
          nodesToReplace.forEach((node, index) => {
            try {
              if (typeof node.outlineStroke === 'function') {
                const outlinedNode = node.outlineStroke();
                if (outlinedNode && node.parent) {
                  // Insert the outlined node at the same position as the original
                  const parent = node.parent;
                  const originalIndex = parent.children.indexOf(node);
                  if (originalIndex !== -1) {
                    parent.insertChild(originalIndex, outlinedNode);
                    // Remove the original node
                    node.remove();
                    console.log(`✓ [${index + 1}/${nodesToReplace.length}] Converted stroke to outline:`, node.type);
                  }
                }
              } else {
                console.warn(`⚠ [${index + 1}/${nodesToReplace.length}] outlineStroke not available for:`, node.type);
              }
            } catch (e) {
              console.error(`❌ [${index + 1}/${nodesToReplace.length}] Error converting stroke:`, e);
            }
          });
          
          // Step 2: Flatten all vectors into one
          console.log('🔄 Starting flatten operation...');
          
          // Flatten function that processes from bottom to top
          function flattenRecursively(node) {
            // Process children first (bottom-up approach)
            if ('children' in node && Array.isArray(node.children) && node.children.length > 0) {
              // Create a copy of children array to avoid issues during flattening
              const children = [...node.children];
              
              // Recursively flatten children first
              children.forEach(child => {
                flattenRecursively(child);
              });
              
              // After children are processed, flatten this node
              if (node.type === 'GROUP') {
                // GROUP nodes have the flatten() method
                try {
                  if (typeof node.flatten === 'function') {
                    node.flatten();
                    console.log('✓ Flattened GROUP:', node.name || 'unnamed');
                  }
                } catch (e) {
                  console.error('❌ Error flattening GROUP:', e.message);
                }
              } else if (node.type === 'FRAME' && node.children.length > 0) {
                // FRAME nodes don't have flatten(), use figma.flatten() instead
                try {
                  const childrenToFlatten = [...node.children];
                  if (childrenToFlatten.length > 1) {
                    // Use figma.flatten() to combine all children into one vector
                    const flattened = figma.flatten(childrenToFlatten, node);
                    console.log('✓ Flattened FRAME children:', node.name || 'unnamed');
                  } else if (childrenToFlatten.length === 1) {
                    // Only one child, no need to flatten
                    console.log('✓ FRAME has only one child, no flatten needed');
                  }
                } catch (e) {
                  console.error('❌ Error flattening FRAME:', e.message);
                }
              }
            }
          }
          
          // Start flattening from the root
          flattenRecursively(variantIconClone);
          
          // Final flatten of root if it's still a group/frame
          if (variantIconClone.type === 'GROUP') {
            try {
              if (typeof variantIconClone.flatten === 'function') {
                variantIconClone.flatten();
                console.log('✓ Flattened root GROUP');
              }
            } catch (e) {
              console.error('❌ Error flattening root GROUP:', e);
            }
          } else if (variantIconClone.type === 'FRAME' && variantIconClone.children.length > 0) {
            try {
              const childrenToFlatten = [...variantIconClone.children];
              if (childrenToFlatten.length > 1) {
                const flattened = figma.flatten(childrenToFlatten, variantIconClone);
                console.log('✓ Flattened root FRAME');
              }
            } catch (e) {
              console.error('❌ Error flattening root FRAME:', e);
            }
          }
          
          console.log('✅ Completed outline stroke conversion and flattening');
          figma.notify('✓ Converted strokes to outline and flattened vectors', { timeout: 2000 });
        }
        
        // After processing, create component and move frame content directly (no extra frame layer)
        try {
          // Helper function to set constraints to SCALE recursively
          function setConstraintsToScale(node) {
            try {
              if ('constraintsHorizontal' in node) {
                node.constraintsHorizontal = 'SCALE';
              }
              if ('constraintsVertical' in node) {
                node.constraintsVertical = 'SCALE';
              }
              if ('children' in node && Array.isArray(node.children)) {
                node.children.forEach(child => {
                  setConstraintsToScale(child);
                });
              }
            } catch (e) {
              // Skip if error
            }
          }
          
          // Create component with the target size
          variantComponent = figma.createComponent();
          variantComponent.resize(variant.size, variant.size);
          
          if (variantIconClone.type === 'FRAME') {
            // Move frame's children directly to component (no frame layer!)
            if (variantIconClone.children.length > 0) {
              const children = [...variantIconClone.children];
              
              // Move each child directly to component, preserving positions and sizes
              children.forEach(child => {
                try {
                  const currentX = child.x || 0;
                  const currentY = child.y || 0;
                  
                  variantComponent.appendChild(child);
                  
                  // Restore position (relative to component now)
                  child.x = currentX;
                  child.y = currentY;
                  
                  // Set constraints to SCALE
                  setConstraintsToScale(child);
                } catch (e) {
                  console.error('Error moving child from frame:', e);
                }
              });
              
              // Remove the empty frame
              variantIconClone.remove();
              
              console.log(`✓ Moved ${children.length} children directly to component (no frame layer)`);
            } else {
              variantIconClone.remove();
            }
          } else {
            // If it's not a frame, add it directly
            variantComponent.appendChild(variantIconClone);
            variantIconClone.x = 0;
            variantIconClone.y = 0;
            setConstraintsToScale(variantIconClone);
          }
        } catch (e) {
          console.error('Error processing variant icon:', e);
          figma.notify('Error processing icon', { timeout: 2000 });
        }
        
        // Name the component using Figma's variant naming convention
        // Format: PropertyName=VariantValue (not ComponentName=PropertyName=VariantValue)
        // The component set name is set separately
        variantComponent.name = `${propertyName}=${variant.name}`;
        
        variantComponents.push(variantComponent);
      });
      
      // Step 3: Add all variant components to the page as siblings
      // combineAsVariants requires components to be siblings (same parent)
      variantComponents.forEach((component, index) => {
        figma.currentPage.appendChild(component);
        // Position components horizontally
        // Calculate position based on node index and component index
        const baseX = selectedNode.x;
        const baseY = selectedNode.y + selectedNode.height + 50 + (nodeIndex * 200); // Stack vertically for each icon
        if (index === 0) {
          component.x = baseX;
          component.y = baseY;
        } else {
          const prevComponent = variantComponents[index - 1];
          component.x = prevComponent.x + prevComponent.width + 16;
          component.y = prevComponent.y;
        }
      });
      
      // Step 4: Create a component set by combining the variants
      // combineAsVariants combines sibling components into a component set
      let componentSet;
      try {
        // Check if combineAsVariants is available
        if (typeof figma.combineAsVariants === 'function') {
          // combineAsVariants takes an array of components and a parent
          // It returns a ComponentSetNode
          componentSet = figma.combineAsVariants(variantComponents, figma.currentPage);
          
          // Set the name of the component set (add index if multiple icons)
          const setName = selectedNodes.length > 1 
            ? `${componentName} ${nodeIndex + 1}` 
            : componentName;
          componentSet.name = setName;
          
          // Configure padding and layout for the component set
          // Component sets can have auto-layout properties
          if ('layoutMode' in componentSet) {
            componentSet.layoutMode = 'HORIZONTAL';
            componentSet.itemSpacing = 16;
            // Increase padding significantly
            componentSet.paddingLeft = 24;
            componentSet.paddingRight = 24;
            componentSet.paddingTop = 24;
            componentSet.paddingBottom = 24;
            componentSet.counterAxisSizingMode = 'AUTO';
          }
          
          // Position the component set (stack vertically for multiple icons)
          const baseY = selectedNode.y + selectedNode.height + 50 + (nodeIndex * 200);
          componentSet.x = selectedNode.x;
          componentSet.y = baseY;
          
          // Try to apply stroke directly to component set
          // Note: ComponentSetNode may not support strokes in the API
          try {
            // Attempt to apply purple dashed border directly
            if ('strokes' in componentSet && Array.isArray(componentSet.strokes)) {
              componentSet.strokes = [{
                type: 'SOLID',
                color: { r: 0x97 / 255, g: 0x47 / 255, b: 0xFF / 255 }
              }];
              componentSet.strokeWeight = 2;
              componentSet.dashPattern = [8, 4];
              componentSet.strokeAlign = 'INSIDE';
            }
          } catch (e) {
            // ComponentSetNode doesn't support strokes directly
            // This is a limitation of the Figma API
            console.log('ComponentSetNode does not support strokes:', e);
          }
          
          // Select the component set
          figma.currentPage.selection = [componentSet];
          figma.viewport.scrollAndZoomIntoView([componentSet]);
        } else {
          // Fallback: components are created but user needs to combine manually
          figma.currentPage.selection = variantComponents;
          figma.viewport.scrollAndZoomIntoView(variantComponents);
          figma.notify('Components created. Please select them and use "Combine as Variants" from the context menu.');
          figma.closePlugin();
          return;
        }
      } catch (error) {
        // If combineAsVariants fails, show error and select components
        console.error('Error combining variants:', error);
        figma.currentPage.selection = variantComponents;
        figma.viewport.scrollAndZoomIntoView(variantComponents);
        figma.notify(`Error: ${error.message}. Please select components and use "Combine as Variants" manually.`);
        figma.closePlugin();
        return;
      }
      
        } catch (nodeError) {
          console.error(`Error processing icon ${nodeIndex + 1}:`, nodeError);
          figma.notify(`Error processing icon ${nodeIndex + 1}: ${nodeError.message}`, { timeout: 3000 });
        }
      });
      
      // Save configuration (only once, after processing all icons)
      figma.clientStorage.setAsync('supericons-config', {
        componentName: componentName,
        propertyName: propertyName,
        variants: variants,
        outlineFlattenEnabled: outlineFlattenEnabled
      }).catch(e => {
        console.error('Error saving config:', e);
      });
      
      // Show success message
      if (selectedNodes.length === 1) {
        figma.notify(`Component set "${componentName}" created with ${variants.length} variants`);
      } else {
        figma.notify(`Created ${selectedNodes.length} component sets with ${variants.length} variants each`);
      }
      // Plugin stays open so user can create more components
    } catch (error) {
      figma.notify(`Error: ${error.message}`);
      console.error('Error creating component set:', error);
    }
  }
  
  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
