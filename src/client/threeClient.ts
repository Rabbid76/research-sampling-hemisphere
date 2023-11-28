import {
    AmbientLight,
    AxesHelper,
    BufferGeometry,
    Color,
    DirectionalLight,
    GridHelper,
    Group,
    LineSegments,
    LineBasicMaterial,
    MathUtils,
    Matrix3,
    Mesh,
    MeshLambertMaterial,
    Object3D,
    PerspectiveCamera,
    PCFSoftShadowMap,
    Scene,
    SphereGeometry,
    Vector3,
    WebGLRenderer,
    ColorRepresentation,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
// @ts-ignore
import Stats from 'three/examples/jsm/libs/stats.module' 
import { GUI } from 'dat.gui'

export const monteCarloVectors = (canvas: any) => {
    const renderer = new WebGLRenderer({canvas: canvas, antialias: true, alpha: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 8;
    camera.position.z = 4;
    const controls = new OrbitControls(camera, renderer.domElement);

    const scene = new Scene();
    scene.background = new Color(0xc0c0c0);

    const gridHelper = new GridHelper(10, 10);
    scene.add(gridHelper);
    const axesHelper = new AxesHelper(2);
    scene.add(axesHelper);
    axesHelper.visible = false;

    const ambientLight = new AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 3, 0);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const sphereGeometry = new SphereGeometry(1, 32, 16);
    const sphereMaterial = new MeshLambertMaterial({color: 0x808080});
    const sphereMesh = new Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphereMesh);

    const vectorGroup = new Group();
    scene.add(vectorGroup);
    const parameters = {
        samples: 16,
        cosineWeight: false,
        rotationSquareSize: 5, 
    };
    const updateVectorGroup = () => {
        vectorGroup.clear();
        const vectorMesh64noise = createVectorLineMesh(
            spiralQuadraticSampleKernel(parameters.samples, parameters.cosineWeight), 
            generateMagicSquareDistributedKernelRotations(parameters.rotationSquareSize), 
            0xff0000
        );
        vectorGroup.add(vectorMesh64noise);
    }
    updateVectorGroup();

    // @ts-ignore
    const stats = new Stats();
    document.body.appendChild(stats.dom);
    const gui = new GUI();
    gui.add(parameters, 'samples', 1, 64, 1).onChange(() => updateVectorGroup());
    gui.add(parameters, 'cosineWeight').onChange(() => updateVectorGroup());
    gui.add(parameters, 'rotationSquareSize', 1, 15, 1).onChange(() => updateVectorGroup());

    window.addEventListener('resize', () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }, false);

    let previousTimeStamp: number | undefined;
    const animate = (timestamp: number) => {
        const deltaTimeMs = timestamp - (previousTimeStamp ?? timestamp);
        previousTimeStamp = timestamp;
        requestAnimationFrame(animate);
        controls.update();
        render();
        stats.update()
    }

    const render = () => {
        renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
}

const createVectorLineMesh = (vectors: Vector3[], noise: Vector3[], color: ColorRepresentation): Object3D => {
    const vertices: Vector3[] = [];
    if (noise.length > 0) {
        noise.forEach(noiseDataVector => {
            const noiseVector = noiseDataVector.clone().multiplyScalar(1/255).multiplyScalar(2).subScalar(1); 
            const viewNormal = new Vector3(0, 0, 1);
            const tangent = noiseVector.clone().sub(viewNormal.clone().multiplyScalar(noiseVector.dot(viewNormal))).normalize();
            console.log(tangent);
            const bitangent = viewNormal.clone().cross(tangent).normalize();
            const kernelMatrix = new Matrix3().set(
                tangent.x, bitangent.x, viewNormal.x,
                tangent.y, bitangent.y, viewNormal.y,
                tangent.z, bitangent.z, viewNormal.z);
            vectors.forEach(vector => {
                const v = vector.clone().applyMatrix3(kernelMatrix);
                const direction = new Vector3(v.x, v.z, -v.y);
                const length = direction.length();
                direction.normalize();
                vertices.push(direction.clone());
                vertices.push(direction.clone().multiplyScalar(1 + length));
            });
        });
    } else {
        vectors.forEach(vector => {
            const direction = new Vector3(vector.x, vector.z, -vector.y);
            const length = direction.length();
            direction.normalize();
            vertices.push(direction.clone());
            vertices.push(direction.clone().multiplyScalar(1 + length));
        });
    }
    const vectorMaterial = new LineBasicMaterial({color});
    const vectorGeometry = new BufferGeometry().setFromPoints(vertices);
    const vectorMesh = new LineSegments(vectorGeometry, vectorMaterial);
    return vectorMesh;
}

const spiralQuadraticSampleKernel = (kernelSize: number, cosineWeighted: boolean): Vector3[] => {
  const kernel: Vector3[] = [];
  for (let kernelIndex = 0; kernelIndex < kernelSize; kernelIndex++) {
    const spiralAngle = kernelIndex * Math.PI * (3 - Math.sqrt(5));
    let z = 0.01 + (kernelIndex / (kernelSize - 1)) * 0.99;
    if (cosineWeighted) {
        z = Math.sqrt(z);
    }
    const radius = 1 - z;
    const x = Math.cos(spiralAngle) * radius;
    const y = Math.sin(spiralAngle) * radius;
    const scaleStep = 4;
    const scaleRange = Math.floor(kernelSize / scaleStep)
    const scaleIndex = Math.floor(kernelIndex / scaleStep) + (kernelIndex % scaleStep) * scaleRange;
    let scale = 1 - scaleIndex / kernelSize;
    scale = MathUtils.lerp(0.1, 1, scale * scale);
    kernel.push(new Vector3(x * scale, y * scale, z * scale));
  }
  return kernel;
}

const uniformQuadraticSampleKernel = (kernelSize: number): Vector3[] => {
    const kernel: Vector3[] = [];
    const altitudeCount = Math.floor(kernelSize / 8);
    const altitudeStep = Math.PI / 2 / altitudeCount;
    for (let kernelIndex = 0; kernelIndex < kernelSize; kernelIndex++) {
      const altitudeIndex = kernelIndex % altitudeCount;
      const azimuthIndex = Math.floor(kernelIndex / altitudeCount);
      const azimuth =(Math.PI * 2 * azimuthIndex) / 8 + altitudeIndex * (Math.PI + (Math.PI * 2) / 11);
      //const altitude = altitudeStep * altitudeIndex;
      const altitude = altitudeStep * altitudeIndex + altitudeStep * (0.75 - 0.5 / azimuthIndex);
      //const altitude = Math.pow(azimuthIndex * 8 + altitudeIndex + 1, 2) * Math.PI / 2;
      const sample = new Vector3();
      sample.x = Math.cos(azimuth) * Math.cos(altitude);
      sample.y = Math.sin(azimuth) * Math.cos(altitude);
      sample.z = Math.sin(altitude);
      sample.normalize();
      let scale = kernelIndex / kernelSize;
      scale = MathUtils.lerp(0.1, 1, scale * scale);
      sample.multiplyScalar(scale);
      kernel.push(sample);
    }
    return kernel;
}

const generateUniformKernelRotations = (): Vector3[] => {
  const noise: Vector3[] = [];
  const width = 4;
  const height = 4;
  const noiseSize = width * height;
  for (let inx = 0; inx < noiseSize; ++inx) {
    const iAng = Math.floor(inx / 2) + (inx % 2) * 8;
    const angle = 2 * Math.PI * iAng / noiseSize;
    const randomVec = new Vector3(Math.cos(angle), Math.sin(angle), 0).normalize();
    const dataVec = new Vector3(
      Math.floor((randomVec.x * 0.5 + 0.5) * 255),
      Math.floor((randomVec.y * 0.5 + 0.5) * 255),
      127
    );
    noise.push(dataVec);
  }
  return noise;
}

export const generateMagicSquareDistributedKernelRotations = (
    size: number
  ): Vector3[] => {
    const noiseSize =
      Math.floor(size) % 2 === 0 ? Math.floor(size) + 1 : Math.floor(size);
    const magicSquare = generateMagicSquare(noiseSize);
    const noiseSquareSize = magicSquare.length;
    const noise: Vector3[] = [];
    for (let inx = 0; inx < noiseSquareSize; ++inx) {
      const iAng = magicSquare[inx];
      const angle = (2 * Math.PI * iAng) / noiseSquareSize;
      const randomVec = new Vector3(
        Math.cos(angle),
        Math.sin(angle),
        0
      ).normalize();
      const dataVec = new Vector3(
        Math.floor((randomVec.x * 0.5 + 0.5) * 255),
        Math.floor((randomVec.y * 0.5 + 0.5) * 255),
        127
      );
      noise.push(dataVec);
    }
    return noise;
  };

export const generateMagicSquare = (size: number): number[] => {
    const noiseSize =
      Math.floor(size) % 2 === 0 ? Math.floor(size) + 1 : Math.floor(size);
    const noiseSquareSize = noiseSize * noiseSize;
    const magicSquare = Array(noiseSquareSize).fill(0);
    let i = Math.floor(noiseSize / 2);
    let j = noiseSize - 1;
    for (let num = 1; num <= noiseSquareSize; ) {
      if (i === -1 && j === noiseSize) {
        j = noiseSize - 2;
        i = 0;
      } else {
        if (j === noiseSize) {
          j = 0;
        }
        if (i < 0) {
          i = noiseSize - 1;
        }
      }
      if (magicSquare[i * noiseSize + j] !== 0) {
        j -= 2;
        i++;
        continue;
      } else {
        magicSquare[i * noiseSize + j] = num++;
      }
      j++;
      i--;
    }
    return magicSquare;
};

// @ts-ignore
monteCarloVectors(three_canvas);
